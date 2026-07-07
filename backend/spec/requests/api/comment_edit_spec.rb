# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
RSpec.describe("Api::CommentEditDelete", type: :request) do
  let(:author)   { create(:user) }
  let(:other)    { create(:user) }
  let!(:team)    { create(:team) }
  let!(:ticket)  { create(:ticket, team: team, created_by: author) }
  let!(:the_comment) { create(:comment, ticket: ticket, author: author, body: "Original") }

  def fresh_csrf_headers
    get("/api/csrf")
    token = response.parsed_body["csrf_token"]
    json_headers.merge(origin_header).merge("X-CSRF-Token" => token)
  end

  # Logs the user in and returns headers that satisfy CSRF + Origin on writes.
  def auth_headers(user)
    login_as(user)
    fresh_csrf_headers
  end

  before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

  path "/api/comments/{id}" do
    parameter name: :id, in: :path, type: :string, format: :uuid

    # --- PATCH /api/comments/:id ---

    patch "Edit a comment (author only)" do
      tags "Comments"
      consumes "application/json"
      produces "application/json"
      description "Updates a comment's body. Author only (403 otherwise). Does " \
        "NOT bump the ticket's modified_at."
      parameter name: :comment, in: :body, schema: {
        type: :object,
        properties: { body: { type: :string, example: "Looks good to me." } },
        required: ["body"],
      }
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      response "200", "author edits their own comment" do
        let(:id)             { the_comment.id }
        let(:_headers)       { auth_headers(author) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "Edited body" } }

        run_test! do |response|
          expect(response.parsed_body["body"]).to(eq("Edited body"))
          expect(the_comment.reload.body).to(eq("Edited body"))
        end
      end

      response "200", "editing does NOT bump the ticket modified_at" do
        let(:id)             { the_comment.id }
        let(:_headers)       { auth_headers(author) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "Edited body" } }
        let!(:original_modified_at) { ticket.modified_at }

        run_test! do
          expect(ticket.reload.modified_at.to_i).to(eq(original_modified_at.to_i))
        end
      end

      response "403", "non-author cannot edit" do
        let(:id)             { the_comment.id }
        let(:_headers)       { auth_headers(other) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "Hijack" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("forbidden"))
          expect(the_comment.reload.body).to(eq("Original"))
        end
      end

      response "422", "blank body" do
        let(:id)             { the_comment.id }
        let(:_headers)       { auth_headers(author) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "404", "unknown comment" do
        let(:id)             { SecureRandom.uuid }
        let(:_headers)       { auth_headers(author) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:comment)        { { body: "Nope" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end
    end

    # --- DELETE /api/comments/:id ---

    delete "Delete a comment (author only)" do
      tags "Comments"
      produces "application/json"
      description "Deletes a comment. Author only (403 otherwise). Does NOT bump " \
        "the ticket's modified_at."
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      response "204", "author deletes their own comment" do
        let(:id)             { the_comment.id }
        let(:_headers)       { auth_headers(author) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

        run_test! do
          expect(Comment.exists?(the_comment.id)).to(be(false))
        end
      end

      response "204", "deleting does NOT bump the ticket modified_at" do
        let(:id)             { the_comment.id }
        let(:_headers)       { auth_headers(author) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let!(:original_modified_at) { ticket.modified_at }

        run_test! do
          expect(ticket.reload.modified_at.to_i).to(eq(original_modified_at.to_i))
        end
      end

      response "403", "non-author cannot delete" do
        let(:id)             { the_comment.id }
        let(:_headers)       { auth_headers(other) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("forbidden"))
          expect(Comment.exists?(the_comment.id)).to(be(true))
        end
      end

      response "404", "unknown comment" do
        let(:id)             { SecureRandom.uuid }
        let(:_headers)       { auth_headers(author) }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
