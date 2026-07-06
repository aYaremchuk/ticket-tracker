# frozen_string_literal: true

# CSRF defense for a cookie-authenticated SPA. Approach (kept deliberately
# simple and sound), layered so any one layer failing still blocks a forged
# write:
#
#   1. SameSite=Lax session cookie (set in Authentication) — the browser will
#      not send the session cookie on cross-site *sub-requests* (the classic
#      CSRF vector: a form/img/fetch triggered by another origin).
#   2. Strict Origin/Referer check on every state-changing request
#      (POST/PATCH/PUT/DELETE): the request's Origin (or Referer host, as a
#      fallback) MUST equal the configured app origin (APP_BASE_URL, plus any
#      CORS_ORIGINS for split-origin dev). Anything else -> 403. This is the
#      primary programmatic defense and needs no shared secret.
#   3. Double-submit token: GET /api/csrf issues a random token and drops it in
#      a readable (non-HttpOnly) SameSite=Lax cookie; the SPA echoes it in the
#      X-CSRF-Token header on writes. The server checks header == cookie. A
#      cross-site attacker cannot read the cookie, so cannot forge the header.
#
# Safe methods (GET/HEAD/OPTIONS) are never checked. Controllers may skip the
# whole thing (e.g. a webhook) via `skip_before_action :verify_request_origin`.
module RequestForgeryProtection
  extend ActiveSupport::Concern

  CSRF_COOKIE = :csrf_token
  CSRF_HEADER = "X-CSRF-Token"
  SAFE_METHODS = ["GET", "HEAD", "OPTIONS"].freeze

  included do
    before_action :verify_request_origin
    before_action :verify_csrf_token
  end

  private

  def state_changing_request?
    SAFE_METHODS.exclude?(request.request_method)
  end

  # Allowed browser origins: the app's own origin plus any explicitly configured
  # split-origin dev servers.
  def allowed_origins
    origins = []
    origins << ENV["APP_BASE_URL"] if ENV["APP_BASE_URL"].present?
    origins.concat(ENV.fetch("CORS_ORIGINS", "").split(",").map(&:strip))
    origins.map { |o| normalize_origin(o) }.compact.uniq
  end

  def normalize_origin(value)
    return if value.blank?

    uri = URI.parse(value)
    return if uri.scheme.nil? || uri.host.nil?

    port = uri.port
    default = (uri.scheme == "https" ? 443 : 80)
    port = nil if port == default
    port ? "#{uri.scheme}://#{uri.host}:#{port}" : "#{uri.scheme}://#{uri.host}"
  rescue URI::InvalidURIError
    nil
  end

  def verify_request_origin
    return unless state_changing_request?

    request_origin = request.headers["Origin"].presence
    request_origin ||= referer_origin
    allowed = allowed_origins

    # If no allowlist is configured (e.g. bare test setups) we cannot enforce
    # this layer; the CSRF token + SameSite still apply.
    return if allowed.empty?

    if request_origin.blank? || allowed.exclude?(normalize_origin(request_origin))
      render_error(
        code: "origin_forbidden",
        message: "Request origin is not allowed",
        status: :forbidden,
      )
    end
  end

  def referer_origin
    referer = request.headers["Referer"].presence
    normalize_origin(referer) if referer
  end

  def verify_csrf_token
    return unless state_changing_request?

    header_token = request.headers[CSRF_HEADER].presence
    cookie_token = cookies[CSRF_COOKIE].presence

    unless header_token && cookie_token &&
        ActiveSupport::SecurityUtils.secure_compare(header_token, cookie_token)
      render_error(
        code: "csrf_invalid",
        message: "Missing or invalid CSRF token",
        status: :forbidden,
      )
    end
  end

  # Issues (or refreshes) the double-submit CSRF token and returns its value.
  # The cookie is intentionally readable by JS (not HttpOnly) so the SPA can
  # echo it back in the header; SameSite=Lax keeps it same-site.
  def issue_csrf_token
    token = SecureRandom.urlsafe_base64(32)
    cookies[CSRF_COOKIE] = {
      value: token,
      httponly: false,
      same_site: :lax,
      secure: Rails.env.production?,
      path: "/",
    }
    token
  end
end
