# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup
RSpec.describe("Api::Me", type: :request) do
  before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

  path "/api/me" do
    get "Return the current user (or null)" do
      tags "Auth"
      produces "application/json"
      description "Public session-restore probe. Always 200: returns the user " \
        "when a valid verified session exists, or null when logged out."

      response "200", "returns the current user or null" do
        schema type: :object,
          properties: {
            user: {
              type: [:object, "null"],
              properties: {
                id: { type: :string },
                email: { type: :string },
              },
              required: ["id", "email"],
            },
          },
          required: ["user"]

        context "with a valid verified session" do
          let(:user) { create(:user) }

          before { login_as(user) }

          run_test! do |response|
            expect(response.parsed_body.dig("user", "id")).to(eq(user.id))
            expect(response.parsed_body.dig("user", "email")).to(eq(user.email))
          end
        end

        context "with no session" do
          run_test! do |response|
            expect(response.parsed_body["user"]).to(be_nil)
          end
        end

        context "with a session for a now-unverified user" do
          let(:user) { create(:user) }

          before do
            login_as(user)
            user.update!(email_verified_at: nil)
          end

          run_test! do |response|
            expect(response.parsed_body["user"]).to(be_nil)
          end
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup
