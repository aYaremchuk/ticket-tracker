# frozen_string_literal: true

# Helpers for request specs that need an authenticated session and/or valid
# CSRF headers. Requests go through the real middleware stack, so we log in via
# the API to obtain genuine signed cookies rather than stubbing.
module AuthHelpers
  ALLOWED_ORIGIN = "http://localhost:8080"

  # Logs the user in through POST /api/login so the signed session cookie is set
  # on the shared integration-session cookie jar. Fetches a CSRF token first (a
  # write requires it). Assumes the user is verified.
  def login_as(user, password: "password123")
    post(
      "/api/login",
      params: { email: user.email, password: password }.to_json,
      headers: csrf_headers,
    )
  end

  # Fetches a CSRF token (also drops the csrf_token cookie into the jar) and
  # returns headers that satisfy the CSRF + Origin checks on writes.
  def csrf_headers
    get("/api/csrf")
    token = response.parsed_body["csrf_token"]
    json_headers.merge(origin_header).merge("X-CSRF-Token" => token)
  end

  def json_headers
    { "Content-Type" => "application/json", "Accept" => "application/json" }
  end

  def origin_header
    { "Origin" => ALLOWED_ORIGIN }
  end
end

RSpec.configure do |config|
  config.include(AuthHelpers, type: :request)

  # A stable allowed origin for CSRF/Origin checks in request specs.
  config.before(:each, type: :request) do
    ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN
  end
end
