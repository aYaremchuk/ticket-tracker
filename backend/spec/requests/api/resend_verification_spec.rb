# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup
RSpec.describe("Api::ResendVerification", type: :request) do
  # Public pre-auth endpoint: CSRF-exempt (no session to forge). No CSRF token
  # or Origin required.
  before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

  path "/api/resend_verification" do
    post "Resend the verification email" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Invalidates prior unused tokens and issues a new one for an " \
        "unverified account. Always returns 202 (no account enumeration). " \
        "Public pre-auth endpoint — CSRF-exempt (no CSRF token or Origin required)."
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: { email: { type: :string, example: "user@example.com" } },
        required: ["email"],
      }

      response "202", "new verification email sent (no CSRF token required)" do
        let(:user) { create(:user, :unverified) }
        let!(:old_token) { EmailVerificationToken.issue!(user) }
        let(:body) { { email: user.email } }

        run_test! do |response|
          expect(response.parsed_body["message"]).to(include("If the account exists"))
          # Prior token invalidated; a fresh one issued; email sent.
          expect(old_token.reload.consumed_at).to(be_present)
          expect(user.email_verification_tokens.active.count).to(eq(1))
          expect(ActionMailer::Base.deliveries.size).to(eq(1))
        end
      end

      response "202", "unknown email — still 202, no email sent" do
        let(:body) { { email: "nobody@example.com" } }

        run_test! do
          expect(ActionMailer::Base.deliveries).to(be_empty)
        end
      end

      response "202", "already-verified email — still 202, no email sent" do
        let(:user) { create(:user) }
        let(:body) { { email: user.email } }

        run_test! do
          expect(ActionMailer::Base.deliveries).to(be_empty)
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup
