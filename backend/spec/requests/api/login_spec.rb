# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/VariableName
RSpec.describe("Api::Login", type: :request) do
  before do
    ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN
    get "/api/csrf"
  end

  let(:"X-CSRF-Token") { response.parsed_body["csrf_token"] }
  let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

  path "/api/login" do
    post "Log in and establish a session" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Verifies the Argon2id password and email-verified status. On " \
        "success sets a signed HttpOnly SameSite=Lax session cookie."
      parameter name: :credentials, in: :body, schema: {
        type: :object,
        properties: {
          email: { type: :string },
          password: { type: :string },
        },
        required: ["email", "password"],
      }
      parameter name: :Origin, in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }

      response "200", "login succeeds and sets the session cookie" do
        let(:user) { create(:user, password: "password123") }
        let(:credentials) { { email: user.email, password: "password123" } }

        run_test! do |response|
          expect(response.parsed_body.dig("user", "id")).to(eq(user.id))
          expect(response.parsed_body.dig("user", "email")).to(eq(user.email))
          # A server-side session was created and the cookie was set.
          expect(Session.where(user: user).count).to(eq(1))
          set_cookie = response.headers["Set-Cookie"].to_s
          expect(set_cookie).to(include("session="))
          expect(set_cookie.downcase).to(include("httponly"))
          expect(set_cookie.downcase).to(include("samesite=lax"))
        end
      end

      response "401", "wrong password" do
        let(:user) { create(:user, password: "password123") }
        let(:credentials) { { email: user.email, password: "nope" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("invalid_credentials"))
        end
      end

      response "401", "unknown email" do
        let(:credentials) { { email: "ghost@example.com", password: "password123" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("invalid_credentials"))
        end
      end

      response "403", "email not verified" do
        let(:user) { create(:user, :unverified, password: "password123") }
        let(:credentials) { { email: user.email, password: "password123" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("email_unverified"))
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/VariableName
