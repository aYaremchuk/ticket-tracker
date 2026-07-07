# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName
RSpec.describe("Api::TicketEvents", type: :request) do
  let(:user)    { create(:user) }
  let!(:team)   { create(:team) }
  let!(:ticket) { create(:ticket, team: team, created_by: user) }

  def fresh_csrf_headers
    get("/api/csrf")
    token = response.parsed_body["csrf_token"]
    json_headers.merge(origin_header).merge("X-CSRF-Token" => token)
  end

  path "/api/tickets/{ticket_id}/events" do
    parameter name: :ticket_id, in: :path, type: :string, format: :uuid

    before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

    get "List activity history for a ticket (newest first)" do
      tags "Ticket events"
      produces "application/json"
      description "Returns the ticket's activity history (created + field changes) ordered by created_at DESC."
      parameter name: "Origin", in: :header, schema: { type: :string }
      security [session_cookie: []]

      let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

      response "200", "records real ticket changes end-to-end and returns them newest-first" do
        let(:ticket_id) { ticket.id }

        before do
          login_as(user)
          # Change state through the real API so the event is recorded by the
          # same code path production uses (Current.user from the session).
          patch(
            "/api/tickets/#{ticket.id}",
            params: { ticket: { state: "in_progress" } }.to_json,
            headers: fresh_csrf_headers,
          )
        end

        run_test! do |response|
          events = response.parsed_body["events"]
          expect(events.length).to(eq(2))

          newest = events.first
          expect(newest["action"]).to(eq("updated"))
          expect(newest["field"]).to(eq("state"))
          expect(newest["old_value"]).to(eq("new"))
          expect(newest["new_value"]).to(eq("in_progress"))
          expect(newest.dig("actor", "email")).to(eq(user.email))

          expect(events.last["action"]).to(eq("created"))
        end
      end

      response "200", "event JSON includes all contract fields" do
        let(:ticket_id) { ticket.id }

        before { login_as(user) }

        run_test! do |response|
          event = response.parsed_body["events"].first
          expect(event.keys).to(include(
            "id", "ticket_id", "actor", "action", "field", "old_value", "new_value", "created_at"
          ))
          expect(event["actor"].keys).to(include("id", "email"))
          expect(event["ticket_id"]).to(eq(ticket.id))
        end
      end

      response "200", "comment additions appear as commented events" do
        let(:ticket_id) { ticket.id }

        before do
          login_as(user)
          post(
            "/api/tickets/#{ticket.id}/comments",
            params: { comment: { body: "First!" } }.to_json,
            headers: fresh_csrf_headers,
          )
        end

        run_test! do |response|
          newest = response.parsed_body["events"].first
          expect(newest["action"]).to(eq("commented"))
          expect(newest["new_value"]).to(eq("First!"))
          expect(newest.dig("actor", "email")).to(eq(user.email))
        end
      end

      response "200", "comment edits and deletions appear as events" do
        let(:ticket_id) { ticket.id }

        before do
          login_as(user)
          headers = fresh_csrf_headers
          post(
            "/api/tickets/#{ticket.id}/comments",
            params: { comment: { body: "Draft" } }.to_json,
            headers: headers,
          )
          comment_id = response.parsed_body["id"]
          patch(
            "/api/comments/#{comment_id}",
            params: { comment: { body: "Final" } }.to_json,
            headers: headers,
          )
          delete("/api/comments/#{comment_id}", headers: headers)
        end

        run_test! do |response|
          actions = response.parsed_body["events"].pluck("action")
          expect(actions.first(3)).to(eq(["comment_deleted", "comment_edited", "commented"]))

          edited = response.parsed_body["events"].find { |e| e["action"] == "comment_edited" }
          expect(edited["old_value"]).to(eq("Draft"))
          expect(edited["new_value"]).to(eq("Final"))
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
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName
