# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
RSpec.describe("Api::PasswordReset", type: :request) do
  before do # rubocop:disable RSpec/ScatteredSetup
    ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN
    get "/api/csrf"
  end

  let(:"X-CSRF-Token") { response.parsed_body["csrf_token"] }
  let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

  path "/api/password_reset" do
    post "Request a password reset link" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Always returns 202 (no account enumeration). If the account " \
        "exists, issues a 24h single-use reset token and emails a link."
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: { email: { type: :string } },
        required: ["email"],
      }
      parameter name: :Origin, in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }

      response "202", "existing account — reset email sent" do
        let(:user) { create(:user) }
        let(:body) { { email: user.email } }

        run_test! do |response|
          expect(response.parsed_body["message"]).to(include("If the account exists"))
          expect(user.password_reset_tokens.active.count).to(eq(1))
          expect(ActionMailer::Base.deliveries.size).to(eq(1))
        end
      end

      response "202", "reissue invalidates the prior unused token" do
        let(:user) { create(:user) }
        let!(:old_token) { PasswordResetToken.issue!(user) }
        let(:body) { { email: user.email } }

        run_test! do
          expect(old_token.reload.consumed_at).to(be_present)
          expect(user.password_reset_tokens.active.count).to(eq(1))
        end
      end

      response "202", "unknown email — still 202, no email sent" do
        let(:body) { { email: "nobody@example.com" } }

        run_test! do
          expect(ActionMailer::Base.deliveries).to(be_empty)
        end
      end
    end
  end

  path "/api/password_reset/confirm" do
    post "Confirm a password reset with a token" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Consumes a valid, unexpired, unconsumed token and sets a new " \
        "Argon2id password (>= 8). Bad/expired/used token -> 410 token_invalid; " \
        "short password -> 422."
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          token: { type: :string },
          password: { type: :string },
        },
        required: ["token", "password"],
      }
      parameter name: :Origin, in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }

      response "200", "password reset succeeds" do
        let(:user) { create(:user, password: "password123") }
        let(:token) { PasswordResetToken.issue!(user) }
        let(:body) { { token: token.raw_token, password: "newpassword456" } }

        run_test! do |response|
          expect(response.parsed_body["message"]).to(eq("Password has been reset."))
          expect(user.reload.authenticate("newpassword456")).to(be_truthy)
          expect(token.reload.consumed_at).to(be_present)
        end
      end

      response "200", "revokes the user's existing sessions" do
        let(:user) { create(:user, password: "password123") }
        let(:token) { PasswordResetToken.issue!(user) }
        let(:body) { { token: token.raw_token, password: "newpassword456" } }

        before { Session.start!(user) } # rubocop:disable RSpec/ScatteredSetup

        run_test! do
          expect(Session.where(user: user).count).to(eq(0))
        end
      end

      response "410", "token already used (single-use)" do
        let(:user) { create(:user) }
        let(:token) do
          t = PasswordResetToken.issue!(user)
          t.consume!
          t
        end
        let(:body) { { token: token.raw_token, password: "newpassword456" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("token_invalid"))
        end
      end

      response "410", "token expired" do
        let(:user) { create(:user) }
        let(:token) do
          t = PasswordResetToken.issue!(user)
          t.update!(expires_at: 1.hour.ago)
          t
        end
        let(:body) { { token: token.raw_token, password: "newpassword456" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("token_invalid"))
        end
      end

      response "410", "unknown/invalid token" do
        let(:body) { { token: "does-not-exist", password: "newpassword456" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("token_invalid"))
        end
      end

      response "422", "password too short" do
        let(:user) { create(:user) }
        let(:token) { PasswordResetToken.issue!(user) }
        let(:body) { { token: token.raw_token, password: "short" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
          # Token not consumed on a failed (validation) attempt.
          expect(token.reload.consumed_at).to(be_nil)
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
