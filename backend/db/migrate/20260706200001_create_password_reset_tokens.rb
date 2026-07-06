# frozen_string_literal: true

# Single-use, 24h password reset tokens. Only the SHA-256 digest of the raw
# token is stored; the raw token lives solely in the emailed link. A token is
# valid when consumed_at is null and expires_at is in the future. Reissuing
# (requesting another reset) invalidates prior unused tokens for the user.
# Deleting a user cascades their tokens. Mirrors email_verification_tokens.
class CreatePasswordResetTokens < ActiveRecord::Migration[8.1]
  def change
    create_table(:password_reset_tokens, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.references(:user, null: false, foreign_key: { on_delete: :cascade }, type: :uuid)
      t.string(:token_digest, null: false)
      t.datetime(:expires_at, null: false)
      t.datetime(:consumed_at)

      t.timestamps
    end

    add_index(:password_reset_tokens, :token_digest, unique: true)
    add_index(:password_reset_tokens, [:user_id, :consumed_at])
  end
end
