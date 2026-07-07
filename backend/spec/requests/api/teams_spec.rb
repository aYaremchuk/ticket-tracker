# frozen_string_literal: true

require "swagger_helper"

# rubocop:disable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
RSpec.describe("Api::Teams", type: :request) do
  let(:user) { create(:user) }

  # Helper: fetch a fresh CSRF token and return the headers needed for writes.
  # Must be called after any previous state-changing request (e.g. login) so
  # we always carry the latest cookie + matching header value.
  def fresh_csrf_headers
    get("/api/csrf")
    token = response.parsed_body["csrf_token"]
    json_headers.merge(origin_header).merge("X-CSRF-Token" => token)
  end

  # Logs in and returns write-safe headers (CSRF + Origin + Content-Type).
  def login_and_csrf_headers
    login_as(user)
    fresh_csrf_headers
  end

  # Returns CSRF-valid write headers WITHOUT logging in.
  # Used to test that a 401 (not 403 csrf_invalid) is returned when there is
  # no session cookie but the CSRF double-submit is satisfied.
  def unauthenticated_csrf_headers
    fresh_csrf_headers
  end

  # --- GET /api/teams ---

  path "/api/teams" do
    get "List all teams (name ASC)" do
      tags "Teams"
      produces "application/json"
      description "Returns all teams ordered by name ascending. Requires an " \
        "authenticated + verified session cookie."
      parameter name: "Origin", in: :header, schema: { type: :string }
      security [session_cookie: []]

      before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

      let(:Origin) { AuthHelpers::ALLOWED_ORIGIN }

      response "200", "returns teams array ordered by name" do
        before do
          login_as(user)
          create(:team, name: "Beta")
          create(:team, name: "Alpha")
        end

        run_test! do |response|
          names = response.parsed_body["teams"].pluck("name")
          expect(names).to(eq(names.sort))
          expect(names).to(include("Alpha", "Beta"))
        end
      end

      response "200", "returns empty array when no teams exist" do
        before { login_as(user) }

        run_test! do |response|
          expect(response.parsed_body["teams"]).to(eq([]))
        end
      end

      response "401", "requires authentication — no session" do
        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end

    # --- POST /api/teams ---

    post "Create a team" do
      tags "Teams"
      consumes "application/json"
      produces "application/json"
      description "Creates a new team. Name is stripped and must be unique " \
        "case-insensitively. Requires CSRF + verified session."
      parameter name: :team, in: :body, schema: {
        type: :object,
        properties: { name: { type: :string, example: "Payments Team" } },
        required: ["name"],
      }
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

      response "201", "team created" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "Payments Team" } }

        run_test! do |response|
          body = response.parsed_body
          expect(body["name"]).to(eq("Payments Team"))
          expect(body["id"]).to(be_present)
          expect(body["ticket_count"]).to(eq(0))
          expect(body["epic_count"]).to(eq(0))
          expect(body["created_at"]).to(be_present)
          expect(body["modified_at"]).to(be_present)
        end
      end

      response "201", "strips whitespace from name" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "  Whitespace Team  " } }

        run_test! do |response|
          expect(response.parsed_body["name"]).to(eq("Whitespace Team"))
        end
      end

      response "422", "blank name" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
          expect(response.parsed_body.dig("error", "details", "name")).to(be_present)
        end
      end

      response "422", "whitespace-only name" do
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "   " } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "409", "duplicate name (case-insensitive)" do
        before { create(:team, name: "Payments Team") }

        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "payments team" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("team_duplicate"))
        end
      end

      response "401", "requires authentication" do
        let(:_headers) { unauthenticated_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "Unauthorized Team" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end
    end
  end

  # --- PATCH /api/teams/:id ---

  path "/api/teams/{id}" do
    parameter name: :id, in: :path, type: :string, format: :uuid

    before { ENV["APP_BASE_URL"] = AuthHelpers::ALLOWED_ORIGIN }

    patch "Rename a team" do
      tags "Teams"
      consumes "application/json"
      produces "application/json"
      description "Updates the team name. Same validation rules as POST."
      parameter name: :team, in: :body, schema: {
        type: :object,
        properties: { name: { type: :string, example: "New Name" } },
        required: ["name"],
      }
      parameter name: "Origin", in: :header, schema: { type: :string }
      parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
      security [session_cookie: []]

      response "200", "team renamed successfully" do
        let!(:existing_team) { create(:team, name: "Old Name") }
        let(:id) { existing_team.id }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "New Name" } }

        run_test! do |response|
          body = response.parsed_body
          expect(body["name"]).to(eq("New Name"))
          expect(body["id"]).to(eq(existing_team.id))
        end
      end

      response "422", "blank name" do
        let!(:existing_team) { create(:team, name: "Alpha") }
        let(:id) { existing_team.id }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("validation_error"))
        end
      end

      response "409", "rename to an existing team name (case-insensitive)" do
        before { create(:team, name: "Beta") }

        let!(:existing_team) { create(:team, name: "Alpha") }
        let(:id) { existing_team.id }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "BETA" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("team_duplicate"))
        end
      end

      response "404", "team not found" do
        let(:id) { SecureRandom.uuid }
        let(:_headers) { login_and_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "Ghost" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
        end
      end

      response "401", "requires authentication" do
        let!(:existing_team) { create(:team) }
        let(:id) { existing_team.id }
        let(:_headers) { unauthenticated_csrf_headers }
        let(:Origin) { _headers["Origin"] }
        let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }
        let(:team) { { name: "Unauthorized" } }

        run_test! do |response|
          expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
        end
      end

      # --- DELETE /api/teams/:id ---

      delete "Delete a team" do
        tags "Teams"
        produces "application/json"
        description "Deletes the team. Returns 204 on success. " \
          "Returns 409 team_has_references when the team has epics or tickets " \
          "(enforced once M3/M4 tables exist; currently always succeeds). " \
          "Returns 404 when the team does not exist."
        parameter name: "Origin", in: :header, schema: { type: :string }
        parameter name: "X-CSRF-Token", in: :header, schema: { type: :string }
        security [session_cookie: []]

        response "204", "team deleted successfully" do
          let!(:existing_team) { create(:team) }
          let(:id) { existing_team.id }
          let(:_headers) { login_and_csrf_headers }
          let(:Origin) { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do
            expect(Team.find_by(id: existing_team.id)).to(be_nil)
          end
        end

        response "404", "team not found" do
          let(:id) { SecureRandom.uuid }
          let(:_headers) { login_and_csrf_headers }
          let(:Origin) { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("not_found"))
          end
        end

        response "401", "requires authentication" do
          let!(:existing_team) { create(:team) }
          let(:id) { existing_team.id }
          let(:_headers) { unauthenticated_csrf_headers }
          let(:Origin) { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("unauthenticated"))
          end
        end

        response "409", "team has epics — delete is blocked" do
          let!(:existing_team) { create(:team) }
          let(:id) { existing_team.id }

          before do
            create(:epic, team: existing_team)
          end

          let(:_headers) { login_and_csrf_headers }
          let(:Origin) { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("team_has_references"))
          end
        end

        response "409", "team has tickets — delete is blocked" do
          let!(:existing_team) { create(:team) }
          let(:id) { existing_team.id }

          before do
            create(:ticket, team: existing_team, created_by: user)
          end

          let(:_headers) { login_and_csrf_headers }
          let(:Origin) { _headers["Origin"] }
          let(:"X-CSRF-Token") { _headers["X-CSRF-Token"] }

          run_test! do |response|
            expect(response.parsed_body.dig("error", "code")).to(eq("team_has_references"))
          end
        end
      end
    end
  end
end
# rubocop:enable RSpec/EmptyExampleGroup, RSpec/ScatteredSetup, RSpec/VariableName, RSpec/MultipleMemoizedHelpers
