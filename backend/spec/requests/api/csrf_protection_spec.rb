# frozen_string_literal: true

require "rails_helper"

# Focused coverage of the CSRF/Origin defense (RequestForgeryProtection). Uses
# signup as a representative public write endpoint.
RSpec.describe("CSRF / Origin protection", type: :request) do
  before { ENV["APP_BASE_URL"] = "http://localhost:8080" }

  let(:payload) { { email: "csrf@example.com", password: "password123" }.to_json }
  let(:json) { { "Content-Type" => "application/json" } }
  let(:allowed_origin) { "http://localhost:8080" }

  def fetch_csrf
    get("/api/csrf")
    response.parsed_body["csrf_token"]
  end

  it "rejects a write with no CSRF token (403 csrf_invalid)" do
    post "/api/signup", params: payload, headers: json.merge("Origin" => allowed_origin)
    expect(response).to(have_http_status(:forbidden))
    expect(response.parsed_body.dig("error", "code")).to(eq("csrf_invalid"))
  end

  it "rejects a write whose header token does not match the cookie" do
    fetch_csrf
    post "/api/signup",
      params: payload,
      headers: json.merge("Origin" => allowed_origin, "X-CSRF-Token" => "tampered")
    expect(response).to(have_http_status(:forbidden))
    expect(response.parsed_body.dig("error", "code")).to(eq("csrf_invalid"))
  end

  it "rejects a write from a disallowed Origin (403 origin_forbidden)" do
    token = fetch_csrf
    post "/api/signup",
      params: payload,
      headers: json.merge("Origin" => "http://evil.example", "X-CSRF-Token" => token)
    expect(response).to(have_http_status(:forbidden))
    expect(response.parsed_body.dig("error", "code")).to(eq("origin_forbidden"))
  end

  it "rejects a write with a missing Origin/Referer when an allowlist is set" do
    token = fetch_csrf
    post "/api/signup", params: payload, headers: json.merge("X-CSRF-Token" => token)
    expect(response).to(have_http_status(:forbidden))
    expect(response.parsed_body.dig("error", "code")).to(eq("origin_forbidden"))
  end

  it "accepts a write with a valid token and the Referer (Origin absent)" do
    token = fetch_csrf
    post "/api/signup",
      params: payload,
      headers: json.merge("Referer" => "#{allowed_origin}/signup", "X-CSRF-Token" => token)
    expect(response).to(have_http_status(:created))
  end

  it "does not require a token or origin on safe GET requests" do
    get "/api/health"
    expect(response).to(have_http_status(:ok))
  end
end
