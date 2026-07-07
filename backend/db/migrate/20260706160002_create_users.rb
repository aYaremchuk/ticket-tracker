# frozen_string_literal: true

# Users table. Email is citext + unique so comparison/uniqueness is
# case-insensitive at the DB level (defense in depth alongside the model).
# Passwords are stored as an Argon2id digest (see User#password=); we do NOT
# use has_secure_password/bcrypt. email_verified_at is null until the user
# confirms via the verification link.
class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table(:users, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.citext(:email, null: false)
      t.string(:password_digest, null: false)
      t.datetime(:email_verified_at)

      t.timestamps
    end

    add_index(:users, :email, unique: true)
  end
end
