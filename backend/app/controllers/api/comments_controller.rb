# frozen_string_literal: true

module Api
  # Comments are nested under tickets for listing/creating; edit/delete are
  # addressed by the comment's own id and are author-only.
  #   GET  /api/tickets/:ticket_id/comments — all comments, oldest-first.
  #   POST /api/tickets/:ticket_id/comments — author is always Current.user.
  #   PATCH  /api/comments/:id — author only (403 otherwise).
  #   DELETE /api/comments/:id — author only (403 otherwise).
  # None of these touch the ticket's modified_at (comments never save the ticket).
  class CommentsController < ApplicationController
    before_action :set_ticket, only: [:index, :create]
    before_action :set_comment, only: [:update, :destroy]
    before_action :require_author, only: [:update, :destroy]

    # GET /api/tickets/:ticket_id/comments
    def index
      # Stable ordering: created_at then id so comments in the same second keep
      # a deterministic order.
      comments = @ticket.comments.includes(:author).order(created_at: :asc, id: :asc)
      render(json: { comments: comments.map { |c| CommentSerializer.call(c) } }, status: :ok)
    end

    # POST /api/tickets/:ticket_id/comments
    def create
      comment = @ticket.comments.new(body: comment_params[:body], author: Current.user)

      if comment.save
        render(json: CommentSerializer.call(comment), status: :created)
      else
        render_validation_errors(comment)
      end
    end

    # PATCH /api/comments/:id
    def update
      if @comment.update(body: comment_params[:body])
        render(json: CommentSerializer.call(@comment), status: :ok)
      else
        render_validation_errors(@comment)
      end
    end

    # DELETE /api/comments/:id
    def destroy
      @comment.destroy!
      head(:no_content)
    end

    private

    def set_ticket
      @ticket = Ticket.find(params.expect(:ticket_id))
    end

    def set_comment
      @comment = Comment.find(params.expect(:id))
    end

    # Editing/deleting is restricted to the comment's author.
    def require_author
      return if @comment.author_id == Current.user.id

      render_error(
        code: "forbidden",
        message: "You can only modify your own comments",
        status: :forbidden,
      )
    end

    def comment_params
      params.expect(comment: [:body])
    end
  end
end
