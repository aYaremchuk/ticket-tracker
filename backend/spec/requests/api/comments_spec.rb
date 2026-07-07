# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
RSpec.describe("Api::Comments", type: :request) do
  let(:user)   { create(:user) }
  let!(:team)  { create(:team) }
  let!(:ticket) { create(:ticket, team: team, created_by: user) }

  def fresh_csrf_headers
    get("/api/csrf")
    token = response.parsed_body["csrf_token"]
    json_headers.merge(origin_header).merge("X-CSRF-Token" => token)
  end

  def login_and_csrf_headers
    login_as(user)
    fresh_csrf_headers
  end

  def unauthenticated_csrf_headers
    fresh_csrf_headers
  end

  path "/api/tickets/{ticket_id}/comments" do
    parameter name: :ticket_id, in: :path, type: :string, format: :uuid

    before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

    # --- GET /api/tickets/:ticket_id/comments ---

    get "List comments for a ticket (oldest first)" do
      tags "Comments"
      produces "application/json"
      description "Returns all comments for a ticket ordered by created_at ASC."
      parameter name: "Origin", in: :header, schema: { type: :string }
      security [session_cookie: []]

      let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

      response "200", "returns comments oldest-first" do
        let(:ticket_id) { ticket.id }
        let!(:author2)  { create(:user) }

        before do
          login_as(user)
          create(:comment, ticket: ticket, author: user,    body: "First comment",  created_at: 1.minute.ago)
          create(:comment, ticket: ticket, author: author2, body: "Second comment", created_at: Time.current)
        end

        run_test! do |response|
          comments = response.parsed_body["comments"]
          expect(comments.length).to(eq(2))
          bodies = comments.pluck("body")
          expect(bodies).to(eq(["First comment", "Second comment"]))
        end
      end

      response "200", "comment JSON includes all contract fields" do
        let(:ticket_id) { ticket.id }

        before do
          login_as(user)
          create(:comment, ticket: ticket, author: user, body: "Contract check")
        end

        run_test! do |response|
          c = response.parsed_body["comments"].first
          expect(c.keys).to(include("id", "ticket_id", "author", "body", "created_at"))
          expect(c["author"].keys).to(include("id", "email"))
          expect(c["ticket_id"]).to(eq(ticket.id))
        end
      end

      response "200", "returns empty array when no comments" do
        let(:ticket_id) { ticket.id }

        before { login_as(user) }

        run_test! do |response|
          expect(response.parsed_body["comments"]).to(eq([]))
        end
      end

      response "404", "ticket not found" do
        let(:ticket_id) { SecureRandom.uuid }

        before { login_as(user) }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication" do
        let(:ticket_id) { ticket.id }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end

    # --- POST /api/tickets/:ticket_id/comments ---

    post "Create a comment" do
      tags "Comments"
      consumes "application/json"
      produces "application/json"
      description "Creates a comment. author = Current.user. Does NOT bump ticket modified_at."
      parameter name: :comment, in: :body, schema: {
        type: :object,
        properties: { body: { type: :string } },
        required: ["body"],
      }
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      response "201", "comment created" do
        let(:ticket_id)      { ticket.id }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "This is a comment" } }

        run_test! do |response|
          body = response.parsed_body
          expect(body["body"]).to(eq("This is a comment"))
          expect(body["author"]["email"]).to(eq(user.email))
          expect(body["ticket_id"]).to(eq(ticket.id))
        end
      end

      response "201", "adding comment does NOT bump ticket modified_at" do
        let(:ticket_id)      { ticket.id }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "Comment body" } }
        let!(:original_modified_at) { ticket.modified_at }

        run_test! do
          expect(ticket.reload.modified_at.to_i).to(eq(original_modified_at.to_i))
        end
      end

      response "422", "blank body" do
        let(:ticket_id)      { ticket.id }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "404", "ticket not found" do
        let(:ticket_id)      { SecureRandom.uuid }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "Orphan comment" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication" do
        let(:ticket_id)      { ticket.id }
        let(:_headers)       { unauthenticated_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "Unauthorized" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
