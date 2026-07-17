-- 🏛️ Supabase Database Schema for Kamoted Blackjack
-- Copy and paste this into the Supabase SQL Editor.

-- Enable Row Level Security (RLS)
-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    bio TEXT DEFAULT 'No bio yet...',
    pfp TEXT DEFAULT 'avatar-1',
    chips BIGINT DEFAULT 10000,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    blackjacks INT DEFAULT 0,
    rank_points INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to automatically insert a profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, chips, rank_points)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', 'player_' || substr(new.id::text, 1, 8)),
    10000,
    0
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
