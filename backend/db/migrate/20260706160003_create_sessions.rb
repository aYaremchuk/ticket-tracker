# frozen_string_literal: true

# Server-side sessions (Rails 8 authentication pattern). The signed HttpOnly
# cookie carries only the session's id; the raw session token is hashed
# (token_digest) so a leaked DB row cannot be replayed as a cookie. We also
# retain ip_address/user_agent for auditing. Deleting a user cascades their
# sessions.
class CreateSessions < ActiveRecord::Migration[8.1]
  def change
    create_table(:sessions, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.references(:user, null: false, foreign_key: { on_delete: :cascade }, type: :uuid)
      t.string(:token_digest, null: false)
      t.string(:ip_address)
      t.string(:user_agent)

      t.timestamps
    end

    add_index(:sessions, :token_digest, unique: true)
  end
end
