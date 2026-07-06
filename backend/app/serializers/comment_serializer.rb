# frozen_string_literal: true

# Shapes the public JSON view of a comment per docs/api-contract.md.
module CommentSerializer
  extend self

  def call(comment)
    {
      id: comment.id,
      ticket_id: comment.ticket_id,
      author: UserSerializer.call(comment.author),
      body: comment.body,
      created_at: comment.created_at.utc.iso8601,
    }
  end
end
