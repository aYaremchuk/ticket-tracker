# frozen_string_literal: true

module Api
  # CRUD for teams. All actions require an authenticated + verified session
  # (default gate from ApplicationController). Writes require CSRF + Origin.
  #
  # DELETE 409 behavior (M3/M4 TODO):
  #   Once epics/tickets tables exist, uncomment `has_many ... dependent:
  #   :restrict_with_error` in the Team model. ActiveRecord will then raise
  #   ActiveRecord::DeleteRestrictionError on destroy, which is rescued here
  #   and mapped to 409 team_has_references.
  class TeamsController < ApplicationController
    before_action :set_team, only: [:update, :destroy]

    # GET /api/teams
    def index
      teams = Team.order(:name)
      render(json: { teams: teams.map { |t| TeamSerializer.call(t) } }, status: :ok)
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
      # (i.e. the team still has referencing epics (M3) or tickets (M4)).
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
