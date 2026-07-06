# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
RSpec.describe("Api::VerifyEmail", type: :request) do
  before do
    ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN
    get "/api/csrf"
  end

  let(:"X-CSRF-Token") { response.parsed_body["csrf_token"] }
  let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }
  let(:user) { create(:user, :unverified) }

  path "/api/verify_email" do
    post "Verify an email address with a token" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Consumes a valid, unexpired, unconsumed token and marks the " \
        "user verified. Expired/used/invalid tokens return 410 token_invalid."
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: { token: { type: :string } },
        required: ["token"],
      }
      parameter name: :Origin, in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }

      response "200", "email verified" do
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
            headers: {
              "Content-Type" => "application/json",
              "Origin" => AuthHelpers::ALLOWED_ORIGIN,
              "X-CSRF-Token" => response.parsed_body["csrf_token"],
            }
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
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
