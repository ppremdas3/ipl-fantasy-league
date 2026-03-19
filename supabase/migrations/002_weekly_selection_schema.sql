-- IPL Fantasy League 2026 — Weekly Selection Schema
-- Run this AFTER 001_initial_schema.sql and the player seed data

-- ─────────────────────────────────────────
-- Add fantasy_price to ipl_players
-- ─────────────────────────────────────────
alter table public.ipl_players
  add column if not exists fantasy_price int not null default 600;

-- ─────────────────────────────────────────
-- TIER 1 — ₹1000L: Elite players
-- ─────────────────────────────────────────
update public.ipl_players set fantasy_price = 1000 where name in (
  -- MI
  'Rohit Sharma', 'Jasprit Bumrah', 'Suryakumar Yadav', 'Hardik Pandya',
  -- CSK
  'Ruturaj Gaikwad', 'MS Dhoni',
  -- RCB
  'Virat Kohli',
  -- KKR
  'Sunil Narine', 'Varun Chakravarthy',
  -- RR
  'Yashasvi Jaiswal', 'Ravindra Jadeja', 'Jofra Archer',
  -- DC
  'Axar Patel', 'Kuldeep Yadav', 'Mitchell Starc',
  -- PBKS
  'Shreyas Iyer', 'Arshdeep Singh', 'Yuzvendra Chahal',
  -- SRH
  'Travis Head', 'Pat Cummins', 'Heinrich Klaasen', 'Abhishek Sharma', 'Nitish Kumar Reddy',
  -- LSG
  'Rishabh Pant', 'Mohammed Shami', 'Mayank Yadav',
  -- GT
  'Shubman Gill', 'Rashid Khan', 'Jos Buttler', 'Kagiso Rabada', 'Mohammed Siraj',
  'Sai Sudharsan', 'Washington Sundar'
);

-- ─────────────────────────────────────────
-- TIER 2 — ₹800L: Key starters
-- ─────────────────────────────────────────
update public.ipl_players set fantasy_price = 800 where name in (
  -- MI
  'Tilak Varma', 'Quinton de Kock', 'Ryan Rickelton', 'Trent Boult',
  'Mitchell Santner', 'Will Jacks', 'Allah Ghazanfar',
  -- CSK
  'Shivam Dube', 'Sanju Samson', 'Khaleel Ahmed', 'Noor Ahmad',
  'Sarfaraz Khan', 'Matt Henry', 'Rahul Chahar',
  -- RCB
  'Rajat Patidar', 'Phil Salt', 'Josh Hazlewood', 'Krunal Pandya',
  'Bhuvneshwar Kumar', 'Jacob Bethell', 'Romario Shepherd', 'Tim David',
  -- KKR
  'Rinku Singh', 'Harshit Rana', 'Rachin Ravindra', 'Andre Russell',
  'Matheesha Pathirana', 'Angkrish Raghuvanshi',
  -- RR
  'Shimron Hetmyer', 'Riyan Parag', 'Dhruv Jurel', 'Ravi Bishnoi',
  'Vaibhav Suryavanshi', 'Sam Curran', 'Kwena Maphaka',
  -- DC
  'KL Rahul', 'David Miller', 'Tristan Stubbs', 'T Natarajan',
  'Karun Nair', 'Pathum Nissanka', 'Kyle Jamieson',
  -- PBKS
  'Prabhsimran Singh', 'Marcus Stoinis', 'Marco Jansen', 'Lockie Ferguson',
  'Shashank Singh', 'Azmatullah Omarzai',
  -- SRH
  'Liam Livingstone', 'Ishan Kishan', 'Harshal Patel', 'Brydon Carse',
  'Kamindu Mendis',
  -- LSG
  'Nicholas Pooran', 'Mitchell Marsh', 'Wanindu Hasaranga', 'Aiden Markram',
  'Avesh Khan', 'Anrich Nortje',
  -- GT
  'Prasidh Krishna', 'Rahul Tewatia', 'Glenn Phillips', 'Jason Holder'
);

-- ─────────────────────────────────────────
-- TIER 3 — ₹600L: Regular players (default, already set above)
-- Explicitly set for clarity on key players left at 600
-- ─────────────────────────────────────────
-- Everyone not in Tier 1 or 2 stays at 600 (the default)

-- ─────────────────────────────────────────
-- TIER 4 — ₹400L: Fringe/backup players
-- ─────────────────────────────────────────
update public.ipl_players set fantasy_price = 400 where name in (
  -- MI backups
  'Danish Malewar', 'Raj Angad Bawa', 'Atharva Ankolekar', 'Mayank Rawat',
  'Mayank Markande', 'Ashwani Kumar', 'Mohammad Izhar', 'Raghu Sharma',
  -- CSK backups
  'Aman Khan', 'Prashant Solanki', 'Ramakrishna Ghosh', 'Kartik Sharma',
  'Mukesh Choudhary', 'Gurjapneet Singh',
  -- RCB backups
  'Satvik Deswal', 'Vicky Ostwal', 'Mangesh Yadav', 'Kanishk Chouhan',
  'Swapnil Singh', 'Rasikh Dar', 'Abhinandan Singh', 'Jacob Duffy',
  -- KKR backups
  'Manish Pandey', 'Rahul Tripathi', 'Ramandeep Singh', 'Anukul Roy',
  'Sarthak Ranjan', 'Daksh Kamra', 'Tejasvi Singh', 'Kartik Tyagi',
  'Vaibhav Arora', 'Umran Malik',
  -- RR backups
  'Shubham Dubey', 'Ravi Singh', 'Aman Rao Perala', 'Yudhvir Singh Charak',
  'Donovan Ferreira', 'Lhuan-dre Pretorius', 'Sandeep Sharma', 'Sushant Mishra',
  'Kuldeep Sen', 'Brijesh Sharma', 'Vignesh Puthur', 'Yash Raj Punia',
  'Adam Milne', 'Nandre Burger', 'Tushar Deshpande',
  -- DC backups
  'Prithvi Shaw', 'Sahil Parakh', 'Ashutosh Sharma', 'Sameer Rizvi',
  'Nitish Rana', 'Ajay Mandal', 'Madhav Tiwari', 'Tripurana Vijay',
  'Vipraj Nigam', 'Abhishek Porel', 'Ben Duckett', 'Mukesh Kumar',
  'Lungi Ngidi', 'Dushmantha Chameera',
  -- PBKS backups
  'Nehal Wadhera', 'Harnoor Pannu', 'Priyansh Arya', 'Pyla Avinash',
  'Musheer Khan', 'Harpreet Brar', 'Suryansh Shedge', 'Cooper Connolly',
  'Mitch Owen', 'Vishnu Vinod', 'Vyshak Vijaykumar', 'Yash Thakur',
  'Pravin Dubey', 'Vishal Nishad', 'Ben Dwarshuis', 'Xavier Bartlett',
  -- SRH backups
  'Smaran Ravichandran', 'Aniket Verma', 'Harsh Dubey', 'Shivang Kumar',
  'Jack Edwards', 'Salil Arora', 'Jaydev Unadkat', 'Shivam Mavi',
  'Zeeshan Ansari', 'Onkar Tarmale', 'Sakib Hussain', 'Praful Hinge',
  'Eshan Malinga',
  -- LSG backups
  'Himmat Singh', 'Ayush Badoni', 'Akshat Raghuwanshi', 'Matthew Breetzke',
  'Abdul Samad', 'Shahbaz Ahmed', 'Arjun Tendulkar', 'Arshin Kulkarni',
  'Mukul Choudhary', 'Josh Inglis', 'Mohsin Khan', 'Digvesh Singh',
  'Akash Singh', 'Naman Tiwari', 'M Siddharth',
  -- GT backups
  'Shahrukh Khan', 'Nishant Sindhu', 'Jayant Yadav', 'R Sai Kishore',
  'Mohd Arshad Khan', 'Anuj Rawat', 'Kumar Kushagra', 'Tom Banton',
  'Manav Suthar', 'Ishant Sharma', 'Gurnoor Singh Brar', 'Prithvi Raj Yarra',
  'Luke Wood',
  -- Misc
  'Naman Dhir', 'Corbin Bosch', 'Robin Minz', 'Deepak Chahar',
  'Shardul Thakur', 'Sherfane Rutherford',
  'Ayush Mhatre', 'Dewald Brevis', 'Jamie Overton', 'Matthew Short',
  'Zak Foulkes', 'Urvil Patel', 'Shreyas Gopal', 'Nathan Ellis', 'Akeal Hosein',
  'Devdutt Padikkal', 'Jordan Cox', 'Yash Dayal', 'Suyash Sharma', 'Nuwan Thushara',
  'Ajinkya Rahane', 'Rovman Powell', 'Cameron Green', 'Finn Allen', 'Tim Seifert',
  'Akash Deep', 'Mustafizur Rahman'
);

-- ─────────────────────────────────────────
-- GAMEWEEKS
-- ─────────────────────────────────────────
create table public.gameweeks (
  id uuid primary key default gen_random_uuid(),
  week_number int unique not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  deadline timestamptz not null,
  status text default 'upcoming' not null check (status in ('upcoming', 'active', 'completed')),
  created_at timestamptz default now() not null
);

alter table public.gameweeks enable row level security;

create policy "Gameweeks viewable by authenticated users"
  on public.gameweeks for select
  to authenticated
  using (true);

create policy "Commissioner can manage gameweeks"
  on public.gameweeks for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────
-- Link matches to gameweeks
-- ─────────────────────────────────────────
alter table public.ipl_matches
  add column if not exists gameweek_id uuid references public.gameweeks(id);

-- ─────────────────────────────────────────
-- WEEKLY SELECTIONS
-- ─────────────────────────────────────────
create table public.weekly_selections (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references public.leagues(id) on delete cascade not null,
  member_id uuid references public.league_members(id) on delete cascade not null,
  gameweek_id uuid references public.gameweeks(id) not null,
  player_id uuid references public.ipl_players(id) not null,
  is_captain boolean default false not null,
  is_vice_captain boolean default false not null,
  created_at timestamptz default now() not null,
  unique(league_id, member_id, gameweek_id, player_id)
);

alter table public.weekly_selections enable row level security;

create policy "Selections viewable by league members"
  on public.weekly_selections for select
  to authenticated
  using (
    league_id in (select public.get_my_league_ids())
  );

create policy "Members can manage their own selections"
  on public.weekly_selections for all
  to authenticated
  using (
    member_id in (
      select id from public.league_members where user_id = auth.uid()
    )
  )
  with check (
    member_id in (
      select id from public.league_members where user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- REALTIME: weekly_selections
-- ─────────────────────────────────────────
alter publication supabase_realtime add table public.weekly_selections;
alter publication supabase_realtime add table public.gameweeks;
