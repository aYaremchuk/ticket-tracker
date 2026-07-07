# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup
RSpec.describe("Api::Signup", type: :request) do
  # Public pre-auth endpoint: CSRF-exempt (no session to forge). No CSRF token
  # or Origin is required.
  before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

  path "/api/signup" do
    post "Register a new (unverified) account" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Creates an unverified user, issues a 24h single-use " \
        "verification token, and emails a verification link. Public pre-auth " \
        "endpoint — CSRF-exempt (no CSRF token or Origin required)."
      parameter name: :credentials, in: :body, schema: {
        type: :object,
        properties: {
          email: { type: :string, example: "user@example.com" },
          password: { type: :string, minLength: 8, example: "password123" },
        },
        required: ["email", "password"],
      }

      response "201", "account created without a CSRF token (CSRF-exempt)" do
        let(:credentials) { { email: "new@example.com", password: "password123" } }

        run_test! do |response|
          expect(response.parsed_body["message"]).to(eq("Verification email sent."))
          user = User.find_by(email: "new@example.com")
          expect(user).to(be_present)
          expect(user).not_to(be_verified)
          expect(user.email_verification_tokens.active.count).to(eq(1))
          expect(ActionMailer::Base.deliveries.size).to(eq(1))
        end
      end

      response "201", "email is trimmed and lower-cased" do
        let(:credentials) { { email: "  MixedCase@Example.COM ", password: "password123" } }

        run_test! do
          expect(User.find_by(email: "mixedcase@example.com")).to(be_present)
        end
      end

      response "422", "password too short" do
        let(:credentials) { { email: "short@example.com", password: "1234567" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
          expect(response.parsed_body.dig("error", "details")).to(be_present)
        end
      end

      response "422", "invalid email" do
        let(:credentials) { { email: "nope", password: "password123" } }

        run_test!
      end

      response "409", "email already registered (case-insensitive)" do
        before { create(:user, email: "taken@example.com") }

        let(:credentials) { { email: "TAKEN@example.com", password: "password123" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("email_taken"))
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup
