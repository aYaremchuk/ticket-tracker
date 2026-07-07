# frozen_string_literal: true

# Single-use, 24h email verification tokens. Only the SHA-256 digest of the
# raw token is stored; the raw token lives solely in the emailed link. A token
# is valid when consumed_at is null and expires_at is in the future. Reissuing
# (resend) invalidates prior unused tokens for the user. Deleting a user
# cascades their tokens.
class CreateEmailVerificationTokens < ActiveRecord::Migration[8.1]
  def change
    create_table(:email_verification_tokens, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.references(:user, null: false, foreign_key: { on_delete: :cascade }, type: :uuid)
      t.string(:token_digest, null: false)
      t.datetime(:expires_at, null: false)
      t.datetime(:consumed_at)

      t.timestamps
    end

    add_index(:email_verification_tokens, :token_digest, unique: true)
    add_index(:email_verification_tokens, [:user_id, :consumed_at])
  end
end
