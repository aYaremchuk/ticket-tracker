# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
RSpec.describe("Api::Tickets", type: :request) do
  let(:user)  { create(:user) }
  let!(:team) { create(:team) }

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

  # --- GET /api/tickets ---

  path "/api/tickets" do
    get "List tickets for a team" do
      tags "Tickets"
      produces "application/json"
      description "Returns all tickets for a team ordered by modified_at DESC. " \
        "team_id required. Optional filters: type, epic_id, q (case-insensitive title substring)."
      parameter name: :team_id, in: :query, type: :string, format: :uuid, required: true
      parameter name: :type, in: :query, type: :string, required: false
      parameter name: :epic_id, in: :query, type: :string, required: false
      parameter name: :q, in: :query, type: :string, required: false
      parameter name: "Origin", in: :header, schema: { type: :string }
      security [session_cookie: []]

      before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

      let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

      response "200", "returns tickets and total for a team" do
        before do
          login_as(user)
          create(:ticket, team: team, title: "Alpha ticket", created_by: user)
          create(:ticket, team: team, title: "Beta ticket",  created_by: user)
        end

        let(:team_id) { team.id }
        let(:type)    { nil }
        let(:epic_id) { nil }
        let(:q)       { nil }

        run_test! do |response|
          body = response.parsed_body
          expect(body["tickets"].length).to(eq(2))
          expect(body["total"]).to(eq(2))
        end
      end

      response "200", "ticket JSON includes all contract fields" do
        before do
          login_as(user)
          create(
            :ticket,
            team: team,
            title: "Contract check",
            body: "Body",
            ticket_type: "feature",
            state: "in_progress",
            created_by: user,
          )
        end

        let(:team_id) { team.id }
        let(:type)    { nil }
        let(:epic_id) { nil }
        let(:q)       { nil }

        run_test! do |response|
          t = response.parsed_body["tickets"].first
          expect(t.keys).to(include(
            "id",
            "number",
            "team_id",
            "epic_id",
            "type",
            "state",
            "title",
            "body",
            "created_by",
            "created_at",
            "modified_at",
            "comment_count",
          ))
          expect(t["type"]).to(eq("feature"))
          expect(t["state"]).to(eq("in_progress"))
          expect(t["created_by"].keys).to(include("id", "email"))
          expect(t["comment_count"]).to(eq(0))
        end
      end

      response "200", "ordered modified_at DESC" do
        before do
          login_as(user)
          t1 = create(:ticket, team: team, created_by: user, title: "Older")
          travel(2.seconds) do
            t1.update!(title: "Older updated")
          end
          travel(5.seconds) do
            create(:ticket, team: team, created_by: user, title: "Newer")
          end
        end

        let(:team_id) { team.id }
        let(:type)    { nil }
        let(:epic_id) { nil }
        let(:q)       { nil }

        run_test! do |response|
          tickets = response.parsed_body["tickets"]
          modified_ats = tickets.pluck("modified_at")
          expect(modified_ats).to(eq(modified_ats.sort.reverse))
        end
      end

      response "200", "filter by type" do
        before do
          login_as(user)
          create(:ticket, team: team, created_by: user, ticket_type: "bug",     title: "Bug one")
          create(:ticket, team: team, created_by: user, ticket_type: "feature", title: "Feature one")
        end

        let(:team_id) { team.id }
        let(:type)    { "bug" }
        let(:epic_id) { nil }
        let(:q)       { nil }

        run_test! do |response|
          body = response.parsed_body
          expect(body["tickets"].length).to(eq(1))
          expect(body["tickets"].first["type"]).to(eq("bug"))
        end
      end

      response "200", "filter by epic_id" do
        let!(:epic)       { create(:epic, team: team) }
        let!(:other_epic) { create(:epic, team: team) }

        before do
          login_as(user)
          create(:ticket, team: team, created_by: user, epic: epic,       title: "In epic")
          create(:ticket, team: team, created_by: user, epic: other_epic, title: "Other epic")
          create(:ticket, team: team, created_by: user, epic: nil,        title: "No epic")
        end

        let(:team_id) { team.id }
        let(:type)    { nil }
        let(:epic_id) { epic.id }
        let(:q)       { nil }

        run_test! do |response|
          body = response.parsed_body
          expect(body["tickets"].length).to(eq(1))
          expect(body["tickets"].first["epic_id"]).to(eq(epic.id))
        end
      end

      response "200", "filter by q (case-insensitive title substring)" do
        before do
          login_as(user)
          create(:ticket, team: team, created_by: user, title: "Fix login bug")
          create(:ticket, team: team, created_by: user, title: "Add new feature")
        end

        let(:team_id) { team.id }
        let(:type)    { nil }
        let(:epic_id) { nil }
        let(:q)       { "LOGIN" }

        run_test! do |response|
          body = response.parsed_body
          expect(body["tickets"].length).to(eq(1))
          expect(body["tickets"].first["title"]).to(eq("Fix login bug"))
        end
      end

      response "200", "filters are AND-combined" do
        let!(:epic) { create(:epic, team: team) }

        before do
          login_as(user)
          create(
            :ticket,
            team: team,
            created_by: user,
            ticket_type: "bug",
            epic: epic,
            title: "Bug in epic",
          )
          create(
            :ticket,
            team: team,
            created_by: user,
            ticket_type: "feature",
            epic: epic,
            title: "Feature in epic",
          )
          create(
            :ticket,
            team: team,
            created_by: user,
            ticket_type: "bug",
            epic: nil,
            title: "Bug no epic",
          )
        end

        let(:team_id) { team.id }
        let(:type)    { "bug" }
        let(:epic_id) { epic.id }
        let(:q)       { nil }

        run_test! do |response|
          body = response.parsed_body
          # Only the bug in the epic matches type=bug AND epic_id
          expect(body["tickets"].length).to(eq(1))
          expect(body["tickets"].first["type"]).to(eq("bug"))
          expect(body["tickets"].first["epic_id"]).to(eq(epic.id))
        end
      end

      response "200", "returns empty array when team has no tickets" do
        before { login_as(user) }

        let(:team_id) { team.id }
        let(:type)    { nil }
        let(:epic_id) { nil }
        let(:q)       { nil }

        run_test! do |response|
          body = response.parsed_body
          expect(body["tickets"]).to(eq([]))
          expect(body["total"]).to(eq(0))
        end
      end

      response "400", "missing team_id param" do
        before { login_as(user) }

        let(:team_id) { nil }
        let(:type)    { nil }
        let(:epic_id) { nil }
        let(:q)       { nil }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("bad_request"))
        end
      end

      response "401", "requires authentication" do
        let(:team_id) { team.id }
        let(:type)    { nil }
        let(:epic_id) { nil }
        let(:q)       { nil }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end

    # --- POST /api/tickets ---

    post "Create a ticket" do
      tags "Tickets"
      consumes "application/json"
      produces "application/json"
      description "Creates a new ticket. state defaults to new. " \
        "422 on blank title/body, bad enum, or epic_team_mismatch. 404 for unknown team/epic."
      parameter name: :ticket, in: :body, schema: {
        type: :object,
        properties: {
          team_id: { type: :string, format: :uuid },
          type: { type: :string, enum: ["bug", "feature", "fix"] },
          title: { type: :string },
          body: { type: :string },
          epic_id: { type: :string, format: :uuid, nullable: true },
        },
        required: ["team_id", "type", "title", "body"],
      }
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

      response "201", "ticket created" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin)          { _headers["Origin"] }
        let(:"X-CSRF-Token")  { _headers["X-CSRF-Token"] }
        let(:ticket) do
          { team_id: team.id, type: "bug", title: "Fix login", body: "Description" }
        end

        run_test! do |response|
          body = response.parsed_body
          expect(body["title"]).to(eq("Fix login"))
          expect(body["type"]).to(eq("bug"))
          expect(body["state"]).to(eq("new"))
          expect(body["number"]).to(be_a(Integer))
          expect(body["created_by"]["email"]).to(eq(user.email))
          expect(body["comment_count"]).to(eq(0))
        end
      end

      response "201", "ticket created with epic" do
        let!(:epic) { create(:epic, team: team) }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin)          { _headers["Origin"] }
        let(:"X-CSRF-Token")  { _headers["X-CSRF-Token"] }
        let(:ticket) do
          {
            team_id: team.id,
            type: "feature",
            title: "Epic ticket",
            body: "Body",
            epic_id: epic.id,
          }
        end

        run_test! do |response|
          expect(response.parsed_body["epic_id"]).to(eq(epic.id))
        end
      end

      response "422", "blank title" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin)          { _headers["Origin"] }
        let(:"X-CSRF-Token")  { _headers["X-CSRF-Token"] }
        let(:ticket) do
          { team_id: team.id, type: "bug", title: "", body: "Body" }
        end

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "422", "blank body" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin)          { _headers["Origin"] }
        let(:"X-CSRF-Token")  { _headers["X-CSRF-Token"] }
        let(:ticket) do
          { team_id: team.id, type: "bug", title: "Title", body: "" }
        end

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "422", "invalid enum type" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin)          { _headers["Origin"] }
        let(:"X-CSRF-Token")  { _headers["X-CSRF-Token"] }
        let(:ticket) do
          { team_id: team.id, type: "task", title: "Title", body: "Body" }
        end

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "422", "epic_team_mismatch on create" do
        let!(:other_team) { create(:team) }
        let!(:other_epic) { create(:epic, team: other_team) }
        let(:_headers)    { login_and_csrf_headers }
        let(:Origin)          { _headers["Origin"] }
        let(:"X-CSRF-Token")  { _headers["X-CSRF-Token"] }
        let(:ticket) do
          {
            team_id: team.id,
            type: "bug",
            title: "Title",
            body: "Body",
            epic_id: other_epic.id,
          }
        end

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("epic_team_mismatch"))
        end
      end

      response "404", "team not found" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin)          { _headers["Origin"] }
        let(:"X-CSRF-Token")  { _headers["X-CSRF-Token"] }
        let(:ticket) do
          { team_id: SecureRandom.uuid, type: "bug", title: "Title", body: "Body" }
        end

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "404", "epic not found" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin)          { _headers["Origin"] }
        let(:"X-CSRF-Token")  { _headers["X-CSRF-Token"] }
        let(:ticket) do
          {
            team_id: team.id,
            type: "bug",
            title: "Title",
            body: "Body",
            epic_id: SecureRandom.uuid,
          }
        end

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication" do
        let(:_headers)       { unauthenticated_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:ticket) do
          { team_id: team.id, type: "bug", title: "Title", body: "Body" }
        end

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end
  end

  # --- GET /api/tickets/:id ---

  path "/api/tickets/{id}" do
    parameter name: :id, in: :path, type: :string, format: :uuid

    before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

    get "Get a single ticket" do
      tags "Tickets"
      produces "application/json"
      security [session_cookie: []]

      response "200", "returns the ticket" do
        let!(:existing_ticket) { create(:ticket, team: team, created_by: user) }
        let(:id) { existing_ticket.id }

        before { login_as(user) }

        run_test! do |response|
          body = response.parsed_body
          expect(body["id"]).to(eq(existing_ticket.id))
          expect(body["body"]).to(be_present)
          expect(body.keys).to(include(
            "number",
            "type",
            "state",
            "title",
            "body",
            "created_by",
            "created_at",
            "modified_at",
            "comment_count",
          ))
        end
      end

      response "404", "ticket not found" do
        let(:id) { SecureRandom.uuid }

        before { login_as(user) }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication" do
        let!(:existing_ticket) { create(:ticket, team: team, created_by: user) }
        let(:id) { existing_ticket.id }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end

    # --- PATCH /api/tickets/:id ---

    patch "Update a ticket" do
      tags "Tickets"
      consumes "application/json"
      produces "application/json"
      description "Updates ticket fields. modified_at only bumped on real change. " \
        "Changing team_id requires epic_id null or in the new team."
      parameter name: :ticket, in: :body, schema: {
        type: :object,
        properties: {
          type: { type: :string, enum: ["bug", "feature", "fix"] },
          state: { type: :string },
          title: { type: :string },
          body: { type: :string },
          team_id: { type: :string, format: :uuid },
          epic_id: { type: :string, format: :uuid, nullable: true },
        },
      }
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      response "200", "updates state (board drag)" do
        let!(:existing_ticket) { create(:ticket, team: team, created_by: user, state: "new") }
        let(:id) { existing_ticket.id }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:ticket)         { { state: "in_progress" } }

        run_test! do |response|
          expect(response.parsed_body["state"]).to(eq("in_progress"))
        end
      end

      response "200", "modified_at advances on real field change" do
        let!(:existing_ticket) { create(:ticket, team: team, created_by: user, title: "Old") }
        let(:id) { existing_ticket.id }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:ticket)         { { title: "New title" } }

        # Advance time so the PATCH lands at least 1 second after create.
        before { travel_to(existing_ticket.modified_at + 2.seconds) }

        run_test! do |response|
          new_modified = response.parsed_body["modified_at"]
          expect(new_modified).not_to(eq(existing_ticket.modified_at.utc.iso8601))
        end
      end

      response "200", "modified_at does NOT advance on unchanged save" do
        let!(:existing_ticket) do
          create(
            :ticket,
            team: team,
            created_by: user,
            title: "Same",
            body: "Same body",
            ticket_type: "bug",
            state: "new",
          )
        end
        let(:id) { existing_ticket.id }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        # Send the same values — no real change.
        let(:ticket)         { { title: "Same", state: "new" } }

        run_test! do |response|
          returned = response.parsed_body["modified_at"]
          expect(returned).to(eq(existing_ticket.modified_at.utc.iso8601))
        end
      end

      response "422", "epic_team_mismatch when changing team_id" do
        let!(:other_team) { create(:team) }
        let!(:epic)       { create(:epic, team: team) }
        let!(:existing_ticket) do
          create(:ticket, team: team, created_by: user, epic: epic)
        end
        let(:id) { existing_ticket.id }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        # Change team but epic still belongs to the original team.
        let(:ticket)         { { team_id: other_team.id } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("epic_team_mismatch"))
        end
      end

      response "422", "invalid state value" do
        let!(:existing_ticket) { create(:ticket, team: team, created_by: user) }
        let(:id) { existing_ticket.id }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:ticket)         { { state: "invalid_state" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "404", "ticket not found" do
        let(:id) { SecureRandom.uuid }
        let(:_headers)       { login_and_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:ticket)         { { state: "done" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication" do
        let!(:existing_ticket) { create(:ticket, team: team, created_by: user) }
        let(:id) { existing_ticket.id }
        let(:_headers)       { unauthenticated_csrf_headers }
        let(:Origin)         { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:ticket)         { { state: "done" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end

      # --- DELETE /api/tickets/:id ---

      delete "Delete a ticket" do
        tags "Tickets"
        produces "application/json"
        description "Deletes the ticket and cascades its comments. Returns 204."
        parameter name: "Origin", in: :header, schema: { type: :string }
        parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
        security [session_cookie: []]

        response "204", "ticket deleted (comments cascade)" do
          let!(:existing_ticket) { create(:ticket, team: team, created_by: user) }
          let(:id) { existing_ticket.id }
          let(:_headers)       { login_and_csrf_headers }
          let(:Origin)         { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          before { create(:comment, ticket: existing_ticket) }

          run_test! do
            expect(Ticket.find_by(id: existing_ticket.id)).to(be_nil)
            expect(Comment.where(ticket_id: existing_ticket.id)).to(be_empty)
          end
        end

        response "404", "ticket not found" do
          let(:id) { SecureRandom.uuid }
          let(:_headers)       { login_and_csrf_headers }
          let(:Origin)         { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
          end
        end

        response "401", "requires authentication" do
          let!(:existing_ticket) { create(:ticket, team: team, created_by: user) }
          let(:id) { existing_ticket.id }
          let(:_headers)       { unauthenticated_csrf_headers }
          let(:Origin)         { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
          end
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
