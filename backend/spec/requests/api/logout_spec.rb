# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/VariableName
RSpec.describe("Api::Logout", type: :request) do
  before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

  let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

  path "/api/logout" do
    delete "Log out and destroy the session" do
      tags "Auth"
      produces "application/json"
      security [{ session_cookie: [] }]
      description "Destroys the current server-side session and clears the cookie."
      parameter name: :Origin, in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }

      response "204", "logged out" do
        let(:user) { create(:user) }
        let(:"X-CSRF-Token") do
          login_as(user)
          get "/api/csrf"
          response.parsed_body["csrf_token"]
        end

        run_test! do
          expect(Session.where(user: user).count).to(eq(0))
        end
      end

      response "401", "no active session" do
        # No login; still need a CSRF token so the request reaches the auth gate.
        let(:"X-CSRF-Token") do
          get "/api/csrf"
          response.parsed_body["csrf_token"]
        end

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/VariableName
