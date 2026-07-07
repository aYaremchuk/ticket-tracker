# frozen_string_literal: true

# Shapes the public JSON view of a user. Only id + email are ever exposed;
# password_digest / verification timestamps stay internal.
module UserSerializer
  extend self

  def call(user)
    { id: user.id, email: user.email }
  end
end
