# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/VariableName
RSpec.describe("Api::ResendVerification", type: :request) do
  before do
    ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN
    get "/api/csrf"
  end

  let(:"X-CSRF-Token") { response.parsed_body["csrf_token"] }
  let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

  path "/api/resend_verification" do
    post "Resend the verification email" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      description "Invalidates prior unused tokens and issues a new one for an " \
        "unverified account. Always returns 202 (no account enumeration)."
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: { email: { type: :string } },
        required: ["email"],
      }
      parameter name: :Origin, in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }

      response "202", "new verification email sent for an unverified account" do
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
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/VariableName
