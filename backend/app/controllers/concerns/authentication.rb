# frozen_string_literal: true

# Session-cookie authentication (Rails 8 pattern, adapted for a JSON API).
#
# The session lives server-side (Session model). The browser holds a *signed*
# HttpOnly SameSite=Lax cookie carrying only { session_id, token }; the raw
# token is verified against the stored digest. On success Current.session is
# set for the request. Controllers get:
#   - require_authentication (default before_action): 401 if no valid session,
#     403 if the user's email is not verified.
#   - allow_unauthenticated_access: opt public actions out of the gate.
module Authentication
  extend ActiveSupport::Concern

  SESSION_COOKIE = :session

  included do
    before_action :require_authentication
  end

  class_methods do
    # Declares actions that do not require an authenticated (or verified) user.
    def allow_unauthenticated_access(**options)
      skip_before_action(:require_authentication, **options)
    end
  end

  private

  def require_authentication
    session = find_session_from_cookie
    return request_unauthenticated unless session

    Current.session = session

    unless session.user.verified?
      return render_error(
        code: "email_unverified",
        message: "Email address is not verified",
        status: :forbidden,
      )
    end

    session
  end

  def find_session_from_cookie
    data = cookies.signed[SESSION_COOKIE]
    return unless data.is_a?(Hash)

    Session.authenticate(
      data["session_id"] || data[:session_id],
      data["token"] || data[:token],
    )
  end

  def request_unauthenticated
    render_error(
      code: "unauthenticated",
      message: "Authentication required",
      status: :unauthorized,
    )
  end

  # Starts a session for the user and sets the signed HttpOnly cookie.
  def start_new_session_for(user)
    session = Session.start!(
      user,
      ip_address: request.remote_ip,
      user_agent: request.user_agent,
    )
    cookies.signed[SESSION_COOKIE] = {
      value: { session_id: session.id, token: session.raw_token },
      httponly: true,
      same_site: :lax,
      secure: Rails.env.production?,
      path: "/",
    }
    session
  end

  # Destroys the current session and clears the cookie.
  def terminate_session
    Current.session&.destroy
    cookies.delete(SESSION_COOKIE, path: "/")
    Current.session = nil
  end
end
