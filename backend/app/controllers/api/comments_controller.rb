# frozen_string_literal: true

module Api
  # Comments are nested under tickets. GET returns all comments oldest-first.
  # POST creates a comment; author is always Current.user (never from params).
  # Adding a comment does NOT touch the ticket's modified_at.
  class CommentsController < ApplicationController
    before_action :set_ticket

    # GET /api/tickets/:ticket_id/comments
    def index
      comments = @ticket.comments.includes(:author).order(created_at: :asc)
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

    private

    def set_ticket
      @ticket = Ticket.find(params.expect(:ticket_id))
    end

    def comment_params
      params.expect(comment: [:body])
    end
  end
end
