# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
RSpec.describe("Api::Epics", type: :request) do
  let(:user) { create(:user) }
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

  # --- GET /api/epics ---

  path "/api/epics" do
    get "List epics for a team (title ASC)" do
      tags "Epics"
      produces "application/json"
      description "Returns all epics for a team ordered by title ascending. " \
        "team_id query param is required. Requires authenticated + verified session."
      parameter name: :team_id, in: :query, type: :string, format: :uuid, required: true
      parameter name: "Origin", in: :header, schema: { type: :string }
      security [session_cookie: []]

      before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

      let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

      response "200", "returns epics array ordered by title" do
        before do
          login_as(user)
          create(:epic, team: team, title: "Zeta epic")
          create(:epic, team: team, title: "Alpha epic")
        end

        let(:team_id) { team.id }

        run_test! do |response|
          titles = response.parsed_body["epics"].pluck("title")
          expect(titles).to(eq(titles.sort))
          expect(titles).to(include("Alpha epic", "Zeta epic"))
        end
      end

      response "200", "returns empty array when team has no epics" do
        before { login_as(user) }

        let(:team_id) { team.id }

        run_test! do |response|
          expect(response.parsed_body["epics"]).to(eq([]))
        end
      end

      response "200", "epic JSON includes all contract fields" do
        before do
          login_as(user)
          create(:epic, team: team, title: "Contract check", description: "Detail")
        end

        let(:team_id) { team.id }

        run_test! do |response|
          epic = response.parsed_body["epics"].first
          expect(epic.keys).to(
            include(
              "id",
              "team_id",
              "title",
              "description",
              "ticket_count",
              "created_at",
              "modified_at",
            ),
          )
          expect(epic["team_id"]).to(eq(team.id))
          expect(epic["ticket_count"]).to(eq(0))
        end
      end

      response "400", "missing team_id param" do
        before { login_as(user) }

        let(:team_id) { nil }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("bad_request"))
        end
      end

      response "404", "team not found" do
        before { login_as(user) }

        let(:team_id) { SecureRandom.uuid }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication — no session" do
        let(:team_id) { team.id }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end

    # --- POST /api/epics ---

    post "Create an epic" do
      tags "Epics"
      consumes "application/json"
      produces "application/json"
      description "Creates a new epic for the given team. team_id is fixed at " \
        "creation. Requires CSRF + verified session."
      parameter name: :epic, in: :body, schema: {
        type: :object,
        properties: {
          team_id: { type: :string, format: :uuid },
          title: { type: :string, example: "Checkout reliability" },
          description: { type: :string, nullable: true },
        },
        required: ["team_id", "title"],
      }
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

      response "201", "epic created with description" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { team_id: team.id, title: "Checkout reliability", description: "Detail" } }

        run_test! do |response|
          body = response.parsed_body
          expect(body["title"]).to(eq("Checkout reliability"))
          expect(body["description"]).to(eq("Detail"))
          expect(body["team_id"]).to(eq(team.id))
          expect(body["id"]).to(be_present)
          expect(body["ticket_count"]).to(eq(0))
          expect(body["created_at"]).to(be_present)
          expect(body["modified_at"]).to(be_present)
        end
      end

      response "201", "epic created without description (null)" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { team_id: team.id, title: "No description epic" } }

        run_test! do |response|
          body = response.parsed_body
          expect(body["description"]).to(be_nil)
        end
      end

      response "201", "strips whitespace from title" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { team_id: team.id, title: "  Whitespace Epic  " } }

        run_test! do |response|
          expect(response.parsed_body["title"]).to(eq("Whitespace Epic"))
        end
      end

      response "422", "blank title" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { team_id: team.id, title: "" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
          expect(response.parsed_body.dig("error", "details", "title")).to(be_present)
        end
      end

      response "422", "whitespace-only title" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { team_id: team.id, title: "   " } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "404", "team not found" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { team_id: SecureRandom.uuid, title: "Ghost Epic" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication" do
        let(:_headers) { unauthenticated_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { team_id: team.id, title: "Unauthorized Epic" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end
  end

  # --- PATCH /api/epics/:id ---

  path "/api/epics/{id}" do
    parameter name: :id, in: :path, type: :string, format: :uuid

    before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

    patch "Update an epic" do
      tags "Epics"
      consumes "application/json"
      produces "application/json"
      description "Updates title and/or description. team_id is immutable — " \
        "any team_id in the payload is silently ignored. Requires CSRF + verified session."
      parameter name: :epic, in: :body, schema: {
        type: :object,
        properties: {
          title: { type: :string, example: "New title" },
          description: { type: :string, nullable: true },
        },
      }
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      response "200", "epic updated successfully" do
        let!(:existing_epic) { create(:epic, team: team, title: "Old Title") }
        let(:id) { existing_epic.id }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { title: "New Title", description: "Updated desc" } }

        run_test! do |response|
          body = response.parsed_body
          expect(body["title"]).to(eq("New Title"))
          expect(body["description"]).to(eq("Updated desc"))
          expect(body["id"]).to(eq(existing_epic.id))
        end
      end

      response "200", "team_id in payload is silently ignored (immutable)" do
        let!(:other_team) { create(:team) }
        let!(:existing_epic) { create(:epic, team: team, title: "Keep team") }
        let(:id) { existing_epic.id }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { title: "Keep team", team_id: other_team.id } }

        run_test! do |response|
          expect(response.parsed_body["team_id"]).to(eq(team.id))
        end
      end

      response "422", "blank title" do
        let!(:existing_epic) { create(:epic, team: team) }
        let(:id) { existing_epic.id }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { title: "" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "404", "epic not found" do
        let(:id) { SecureRandom.uuid }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { title: "Ghost" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication" do
        let!(:existing_epic) { create(:epic, team: team) }
        let(:id) { existing_epic.id }
        let(:_headers) { unauthenticated_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:epic) { { title: "Unauthorized" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end

      # --- DELETE /api/epics/:id ---

      delete "Delete an epic" do
        tags "Epics"
        produces "application/json"
        description "Deletes the epic. Returns 204 on success. " \
          "Returns 409 epic_has_tickets when the epic has referencing tickets " \
          "(enforced in M4; currently always succeeds). " \
          "Returns 404 when the epic does not exist."
        parameter name: "Origin", in: :header, schema: { type: :string }
        parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
        security [session_cookie: []]

        response "204", "epic deleted successfully" do
          let!(:existing_epic) { create(:epic, team: team) }
          let(:id) { existing_epic.id }
          let(:_headers) { login_and_csrf_headers }
          let(:Origin) { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do
            expect(Epic.find_by(id: existing_epic.id)).to(be_nil)
          end
        end

        response "404", "epic not found" do
          let(:id) { SecureRandom.uuid }
          let(:_headers) { login_and_csrf_headers }
          let(:Origin) { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
          end
        end

        response "401", "requires authentication" do
          let!(:existing_epic) { create(:epic, team: team) }
          let(:id) { existing_epic.id }
          let(:_headers) { unauthenticated_csrf_headers }
          let(:Origin) { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
          end
        end

        response "409", "epic has tickets — delete is blocked" do
          let!(:existing_epic) { create(:epic, team: team) }
          let(:id)             { existing_epic.id }
          let(:_headers)       { login_and_csrf_headers }
          let(:Origin)         { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          before do
            create(:ticket, epic: existing_epic, team: team, created_by: user)
          end

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("epic_has_tickets"))
          end
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
