# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup
RSpec.describe("Api::Csrf", type: :request) do
  before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

  path "/api/csrf" do
    get "Fetch a CSRF token" do
      tags "Auth"
      produces "application/json"
      description "Returns a CSRF token and sets it as a readable SameSite=Lax " \
        "cookie. The SPA echoes it in X-CSRF-Token on writes (double-submit)."

      response "200", "csrf token issued" do
        schema type: :object,
          properties: { csrf_token: { type: :string } },
          required: ["csrf_token"]

        run_test! do |response|
          expect(response.parsed_body["csrf_token"]).to(be_present)
          # Also dropped as a cookie so the double-submit check can compare.
          expect(cookies[:csrf_token]).to(eq(response.parsed_body["csrf_token"]))
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup
