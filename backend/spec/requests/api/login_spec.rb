# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup
RSpec.describe("Api::Login", type: :request) do
  # Public pre-auth endpoint: CSRF-exempt (no session to forge). No CSRF token
  # or Origin is required to log in.
  before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN } # rubocop:disable RSpec/ScatteredSetup

  path "/api/login" do
    post "Log in and establish a session" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Verifies the Argon2id password and email-verified status. On " \
        "success sets a signed HttpOnly SameSite=Lax session cookie. Public " \
        "pre-auth endpoint — CSRF-exempt (no CSRF token or Origin required)."
      parameter name: :credentials, in: :body, schema: {
        type: :object,
        properties: {
          email: { type: :string, example: "user@example.com" },
          password: { type: :string, example: "password123" },
        },
        required: ["email", "password"],
      }

      response "200", "login succeeds without a CSRF token (CSRF-exempt)" do
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

      response "401", "unknown email still performs a decoy password verify (no timing enumeration)" do
        let(:credentials) { { email: "ghost@example.com", password: "password123" } }

        before do # rubocop:disable RSpec/ScatteredSetup
          # Assert the unknown-email path runs a full Argon2 verification so its
          # timing matches the known-email path.
          allow(User).to(receive(:waste_password_comparison).and_call_original)
        end

        run_test! do |response|
          expect(User).to(have_received(:waste_password_comparison).with("password123"))
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
# rubocop:enable RSpec/EmptyExampleGroup
