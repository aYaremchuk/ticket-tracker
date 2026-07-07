# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup
RSpec.describe("Api::VerifyEmail", type: :request) do
  # Public pre-auth endpoint: CSRF-exempt (no session to forge). No CSRF token
  # or Origin required.
  before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

  let(:user) { create(:user, :unverified) }

  path "/api/verify_email" do
    post "Verify an email address with a token" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Consumes a valid, unexpired, unconsumed token and marks the " \
        "user verified. Expired/used/invalid tokens return 410 token_invalid. " \
        "Public pre-auth endpoint — CSRF-exempt (no CSRF token or Origin required)."
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: { token: { type: :string, example: "abc123verifytoken" } },
        required: ["token"],
      }

      response "200", "email verified without a CSRF token (CSRF-exempt)" do
        let(:token) { EmailVerificationToken.issue!(user) }
        let(:body) { { token: token.raw_token } }

        run_test! do |response|
          expect(response.parsed_body["message"]).to(eq("Email verified."))
          expect(response.parsed_body["email"]).to(eq(user.email))
          expect(user.reload).to(be_verified)
          expect(token.reload.consumed_at).to(be_present)
        end
      end

      response "410", "token already used (single-use)" do
        let(:issued) do
          t = EmailVerificationToken.issue!(user)
          post "/api/verify_email",
            params: { token: t.raw_token }.to_json,
            headers: { "Content-Type" => "application/json" }
          t
        end
        let(:body) { { token: issued.raw_token } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("token_invalid"))
        end
      end

      response "410", "token expired" do
        let(:token) do
          t = EmailVerificationToken.issue!(user)
          t.update!(expires_at: 1.hour.ago)
          t
        end
        let(:body) { { token: token.raw_token } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("token_invalid"))
          expect(user.reload).not_to(be_verified)
        end
      end

      response "410", "unknown/invalid token" do
        let(:body) { { token: "does-not-exist" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("token_invalid"))
        end
      end

      response "422", "missing token" do
        let(:body) { { token: "" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup
