# frozen_string_literal: true

module Api
  # CRUD for tickets. All actions require an authenticated + verified session.
  # Writes require CSRF + Origin.
  #
  # GET /api/tickets requires team_id. Filters (type, epic_id, q) are AND-combined.
  # Ordered modified_at DESC.
  #
  # modified_at is advanced only on real field/state changes (handled in model).
  # created_by is set from Current.user on create (never from params).
  class TicketsController < ApplicationController
    before_action :set_ticket, only: [:show, :update, :destroy]

    # GET /api/tickets?team_id=<uuid>&type=&epic_id=&q=
    def index
      team_id = params[:team_id]
      if team_id.blank?
        return render_error(
          code: "bad_request",
          message: "team_id is required",
          status: :bad_request,
        )
      end

      # 404 if team does not exist
      Team.find(team_id)

      scope = Ticket.where(team_id: team_id)
      scope = scope.where(ticket_type: params[:type]) if params[:type].present?
      scope = scope.where(epic_id: params[:epic_id])  if params[:epic_id].present?
      scope = scope.where("LOWER(title) LIKE ?", "%#{params.expect(:q).downcase}%") if params[:q].present?
      scope = scope.order(modified_at: :desc)

      tickets = scope.includes(:created_by)
      total   = tickets.size

      # Precompute comment counts in a single grouped query to avoid N+1.
      comment_counts = Comment.where(ticket_id: tickets.map(&:id))
        .group(:ticket_id).count

      render(
        json: {
          tickets: tickets.map do |t|
            TicketSerializer.call(t, comment_count: comment_counts.fetch(t.id, 0))
          end,
          total: total,
        },
        status: :ok,
      )
    end

    # GET /api/tickets/:id
    def show
      render(json: TicketSerializer.call(@ticket), status: :ok)
    end

    # POST /api/tickets
    def create
      # Validate team + epic existence before building the ticket.
      team = find_team!(create_params[:team_id])
      return unless team

      if create_params[:epic_id].present?
        epic = find_epic!(create_params[:epic_id])
        return unless epic
      end

      ticket = Ticket.new(create_params.merge(created_by: Current.user))

      if ticket.save
        render(json: TicketSerializer.call(ticket), status: :created)
      else
        render_ticket_errors(ticket)
      end
    end

    # PATCH /api/tickets/:id
    def update
      # If team_id is changing, validate the new team exists.
      if update_params[:team_id].present? && update_params[:team_id] != @ticket.team_id
        return unless find_team!(update_params[:team_id])
      end

      # If epic_id is being set (non-nil), validate the epic exists.
      if update_params.key?(:epic_id) && update_params[:epic_id].present?
        return unless find_epic!(update_params[:epic_id])
      end

      if @ticket.update(update_params)
        render(json: TicketSerializer.call(@ticket), status: :ok)
      else
        render_ticket_errors(@ticket)
      end
    end

    # DELETE /api/tickets/:id
    def destroy
      @ticket.destroy!
      head(:no_content)
    end

    private

    def set_ticket
      @ticket = Ticket.includes(:created_by).find(params.expect(:id))
    end

    def create_params
      p = params.expect(ticket: [:team_id, :type, :title, :body, :epic_id])
      # Rails' wrap_parameters excludes `type` (STI column) from the nested hash;
      # it stays at the top level of params. Pick it up from there if not already
      # in the nested hash.
      p["type"] ||= params[:type] if params[:type].present?
      remap_type(p)
    end

    def update_params
      p = params.expect(ticket: [:team_id, :type, :title, :body, :epic_id, :state])
      p["type"] ||= params[:type] if params[:type].present?
      remap_type(p)
    end

    # The API uses `type` but the DB/model uses `ticket_type` (STI conflict).
    # ActionController::Parameters uses string keys internally; both symbol and
    # string lookups work via HashWithIndifferentAccess behaviour.
    def remap_type(permitted)
      if permitted.key?("type")
        val = permitted.delete("type")
        permitted["ticket_type"] = val
      end
      permitted
    end

    def find_team!(id)
      Team.find(id)
    rescue ActiveRecord::RecordNotFound
      render_error(code: "not_found", message: "Team not found", status: :not_found)
      nil
    end

    def find_epic!(id)
      Epic.find(id)
    rescue ActiveRecord::RecordNotFound
      render_error(code: "not_found", message: "Epic not found", status: :not_found)
      nil
    end

    def render_ticket_errors(ticket)
      if ticket.errors.of_kind?(:epic_id, :epic_team_mismatch)
        render_error(
          code: "epic_team_mismatch",
          message: "Epic must belong to the same team as the ticket",
          status: :unprocessable_content,
        )
      else
        render_validation_errors(ticket)
      end
    end
  end
end
