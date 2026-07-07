# frozen_string_literal: true

FactoryBot.define do
  factory :comment do
    association :ticket
    association :author, factory: :user

    sequence(:body) { |n| "Comment body #{n}" }
  end
end
