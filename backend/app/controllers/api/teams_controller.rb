# frozen_string_literal: true

module Api
  # CRUD for teams. All actions require an authenticated + verified session
  # (default gate from ApplicationController). Writes require CSRF + Origin.
  #
  # N+1 fix: ticket_count and epic_count are resolved with a single grouped
  # COUNT query each rather than one query per team.
  class TeamsController < ApplicationController
    before_action :set_team, only: [:update, :destroy]

    # GET /api/teams
    def index
      teams = Team.order(:name)

      # Precompute counts in two bulk queries to avoid N+1.
      ticket_counts = Ticket.where(team_id: teams.map(&:id))
        .group(:team_id).count
      epic_counts   = Epic.where(team_id: teams.map(&:id))
        .group(:team_id).count

      render(
        json: {
          teams: teams.map do |t|
            TeamSerializer.call(
              t,
              ticket_count: ticket_counts.fetch(t.id, 0),
              epic_count:   epic_counts.fetch(t.id, 0),
            )
          end,
        },
        status: :ok,
      )
    end

    # POST /api/teams
    def create
      team = Team.new(team_params)

      if team.save
        render(json: TeamSerializer.call(team), status: :created)
      elsif duplicate_name?(team)
        render_error(
          code: "team_duplicate",
          message: "A team with that name already exists",
          status: :conflict,
        )
      else
        render_validation_errors(team)
      end
    rescue ActiveRecord::RecordNotUnique
      render_error(
        code: "team_duplicate",
        message: "A team with that name already exists",
        status: :conflict,
      )
    end

    # PATCH /api/teams/:id
    def update
      if @team.update(team_params)
        render(json: TeamSerializer.call(@team), status: :ok)
      elsif duplicate_name?(@team)
        render_error(
          code: "team_duplicate",
          message: "A team with that name already exists",
          status: :conflict,
        )
      else
        render_validation_errors(@team)
      end
    rescue ActiveRecord::RecordNotUnique
      render_error(
        code: "team_duplicate",
        message: "A team with that name already exists",
        status: :conflict,
      )
    end

    # DELETE /api/teams/:id
    def destroy
      @team.destroy!
      head(:no_content)
    rescue ActiveRecord::RecordNotDestroyed
      # Raised by destroy! when `dependent: :restrict_with_error` blocks deletion
      # (i.e. the team still has referencing epics or tickets).
      render_error(
        code: "team_has_references",
        message: "Team has associated epics or tickets and cannot be deleted",
        status: :conflict,
      )
    end

    private

    def set_team
      @team = Team.find(params.expect(:id))
    end

    def team_params
      params.expect(team: [:name])
    end

    def duplicate_name?(team)
      team.errors.of_kind?(:name, :taken)
    end
  end
end
