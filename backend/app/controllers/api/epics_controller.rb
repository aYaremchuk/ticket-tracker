# frozen_string_literal: true

module Api
  # CRUD for epics. All actions require an authenticated + verified session
  # (default gate from ApplicationController). Writes require CSRF + Origin.
  #
  # Scope: epics are always scoped to a team. GET requires team_id param.
  # team_id is fixed at creation (immutable) — PATCH ignores any team_id
  # in the payload (attr_readonly on the model silently discards it).
  #
  # N+1 fix: ticket_count is resolved with a single grouped COUNT query
  # for the index action.
  class EpicsController < ApplicationController
    before_action :set_epic, only: [:update, :destroy]

    def index
      team_id = params[:team_id]
      if team_id.blank?
        return render_error(
          code: "bad_request",
          message: "team_id is required",
          status: :bad_request,
        )
      end

      team = Team.find(team_id)
      epics = team.epics.order(:title)

      ticket_counts = Ticket.where(epic_id: epics.map(&:id))
        .group(:epic_id).count

      render(
        json: {
          epics: epics.map do |e|
            EpicSerializer.call(e, ticket_count: ticket_counts.fetch(e.id, 0))
          end,
        },
        status: :ok,
      )
    end

    def create
      team = Team.find(create_params[:team_id])
      epic = team.epics.new(title: create_params[:title], description: create_params[:description])

      if epic.save
        render(json: EpicSerializer.call(epic), status: :created)
      else
        render_validation_errors(epic)
      end
    rescue ActiveRecord::RecordNotFound
      render_error(code: "not_found", message: "Team not found", status: :not_found)
    end

    def update
      if @epic.update(update_params)
        render(json: EpicSerializer.call(@epic), status: :ok)
      else
        render_validation_errors(@epic)
      end
    end

    def destroy
      @epic.destroy!
      head(:no_content)
    rescue ActiveRecord::RecordNotDestroyed
      # Raised by destroy! when `dependent: :restrict_with_error` blocks deletion
      # (i.e. the epic still has referencing tickets).
      render_error(
        code: "epic_has_tickets",
        message: "Epic has associated tickets and cannot be deleted",
        status: :conflict,
      )
    end

    private

    def set_epic
      @epic = Epic.find(params.expect(:id))
    end

    def create_params
      params.expect(epic: [:team_id, :title, :description])
    end

    def update_params
      params.expect(epic: [:title, :description])
    end
  end
end
