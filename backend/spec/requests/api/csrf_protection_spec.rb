# frozen_string_literal: true

require "rails_helper"

# Focused coverage of the CSRF/Origin defense (RequestForgeryProtection).
#
# Authenticated (session-based) writes carry full CSRF + Origin enforcement, so
# a team create is used as the representative protected write. Public pre-auth
# endpoints (signup, login, verify, resend, password reset) are CSRF-exempt via
# `skip_csrf_protection`; the exemption is proven at the bottom.
RSpec.describe("CSRF / Origin protection", type: :request) do
  before { ENV["APP_BASE_URL"] = "http://localhost:8080" }

  let(:user) { create(:user) }
  let(:payload) { { name: "Protected Team" }.to_json }
  let(:json) { { "Content-Type" => "application/json" } }
  let(:allowed_origin) { "http://localhost:8080" }

  def fetch_csrf
    get("/api/csrf")
    response.parsed_body["csrf_token"]
  end

  # Establishes an authenticated session (login is itself CSRF-exempt now).
  def login!
    post(
      "/api/login",
      params: { email: user.email, password: "password123" }.to_json,
      headers: json.merge("Origin" => allowed_origin),
    )
  end

  describe "an authenticated write (POST /api/teams)" do
    before { login! }

    it "rejects a write with no CSRF token (403 csrf_invalid)" do
      post "/api/teams", params: payload, headers: json.merge("Origin" => allowed_origin)
      expect(response).to(have_http_status(:forbidden))
      expect(response.parsed_body.dig("error", "code")).to(eq("csrf_invalid"))
    end

    it "rejects a write whose header token does not match the cookie" do
      fetch_csrf
      post "/api/teams",
        params: payload,
        headers: json.merge("Origin" => allowed_origin, "X-CSRF-Token" => "tampered")
      expect(response).to(have_http_status(:forbidden))
      expect(response.parsed_body.dig("error", "code")).to(eq("csrf_invalid"))
    end

    it "rejects a write from a disallowed Origin (403 origin_forbidden)" do
      token = fetch_csrf
      post "/api/teams",
        params: payload,
        headers: json.merge("Origin" => "http://evil.example", "X-CSRF-Token" => token)
      expect(response).to(have_http_status(:forbidden))
      expect(response.parsed_body.dig("error", "code")).to(eq("origin_forbidden"))
    end

    it "rejects a write with a missing Origin/Referer when an allowlist is set" do
      token = fetch_csrf
      post "/api/teams", params: payload, headers: json.merge("X-CSRF-Token" => token)
      expect(response).to(have_http_status(:forbidden))
      expect(response.parsed_body.dig("error", "code")).to(eq("origin_forbidden"))
    end

    it "accepts a write with a valid token and the Referer (Origin absent)" do
      token = fetch_csrf
      post "/api/teams",
        params: payload,
        headers: json.merge("Referer" => "#{allowed_origin}/teams", "X-CSRF-Token" => token)
      expect(response).to(have_http_status(:created))
    end
  end

  it "does not require a token or origin on safe GET requests" do
    get "/api/health"
    expect(response).to(have_http_status(:ok))
  end

  describe "public pre-auth endpoints are CSRF-exempt" do
    it "allows signup with NO CSRF token or Origin" do
      post "/api/signup",
        params: { email: "exempt@example.com", password: "password123" }.to_json,
        headers: json
      expect(response).to(have_http_status(:created))
    end

    it "allows login with NO CSRF token or Origin" do
      login!
      expect(response).to(have_http_status(:ok))
    end
  end

  describe "fail-closed when no allowlist is configured" do
    around do |example|
      original = ENV["APP_BASE_URL"]
      original_cors = ENV["CORS_ORIGINS"]
      example.run
      ENV["APP_BASE_URL"] = original
      ENV["CORS_ORIGINS"] = original_cors
    end

    # Runs AFTER the global auth-helper before-hook (which sets APP_BASE_URL), so
    # the allowlist is genuinely empty for these examples.
    before do
      ENV.delete("APP_BASE_URL")
      ENV.delete("CORS_ORIGINS")
    end

    it "still allows an authenticated write outside production (dev/test convenience)" do
      login!
      token = fetch_csrf
      post "/api/teams",
        params: payload,
        headers: json.merge("Origin" => allowed_origin, "X-CSRF-Token" => token)
      # Not blocked by the Origin layer (empty allowlist, non-production).
      expect(response).to(have_http_status(:created))
    end

    it "blocks an authenticated write in production (fail closed, 403 origin_forbidden)" do
      login!
      allow(Rails).to(receive(:env).and_return(ActiveSupport::StringInquirer.new("production")))
      token = fetch_csrf
      post "/api/teams",
        params: payload,
        headers: json.merge("Origin" => allowed_origin, "X-CSRF-Token" => token)
      expect(response).to(have_http_status(:forbidden))
      expect(response.parsed_body.dig("error", "code")).to(eq("origin_forbidden"))
    end
  end
end
