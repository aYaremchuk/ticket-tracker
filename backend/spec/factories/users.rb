# frozen_string_literal: true

FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    password { "password123" }

    # Verified by default so most specs can log in; use the :unverified trait
    # for the signup / verification flow.
    email_verified_at { Time.current }

    trait :unverified do
      email_verified_at { nil }
    end
  end
end
