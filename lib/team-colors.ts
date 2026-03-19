export type IPLTeamInfo = {
  name: string
  abbr: string
  primary: string     // main brand color
  secondary: string   // accent color
  logoUrl: string
}

export const IPL_TEAMS: IPLTeamInfo[] = [
  {
    name: 'Mumbai Indians',
    abbr: 'MI',
    primary: '#004BA0',
    secondary: '#D1AB3E',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/MI.png',
  },
  {
    name: 'Chennai Super Kings',
    abbr: 'CSK',
    primary: '#F9CD05',
    secondary: '#0081E9',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/CSK.png',
  },
  {
    name: 'Royal Challengers Bengaluru',
    abbr: 'RCB',
    primary: '#EC1C24',
    secondary: '#000000',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/RCB.png',
  },
  {
    name: 'Kolkata Knight Riders',
    abbr: 'KKR',
    primary: '#3B225F',
    secondary: '#F7C948',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/KKR.png',
  },
  {
    name: 'Delhi Capitals',
    abbr: 'DC',
    primary: '#0078BC',
    secondary: '#EF1C25',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/DC.png',
  },
  {
    name: 'Punjab Kings',
    abbr: 'PBKS',
    primary: '#ED1B24',
    secondary: '#A7A9AC',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/PBKS.png',
  },
  {
    name: 'Rajasthan Royals',
    abbr: 'RR',
    primary: '#254AA5',
    secondary: '#FF69B4',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/RR.png',
  },
  {
    name: 'Sunrisers Hyderabad',
    abbr: 'SRH',
    primary: '#FF822A',
    secondary: '#000000',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/SRH.png',
  },
  {
    name: 'Lucknow Super Giants',
    abbr: 'LSG',
    primary: '#A72056',
    secondary: '#FBDA3C',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/LSG.png',
  },
  {
    name: 'Gujarat Titans',
    abbr: 'GT',
    primary: '#1C1C1C',
    secondary: '#1DA462',
    logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/GT.png',
  },
]

/** Find team info by full name or abbreviation (case-insensitive, partial match) */
export function getTeamInfo(teamName: string): IPLTeamInfo | null {
  if (!teamName) return null
  const lower = teamName.toLowerCase().trim()

  // Exact name match
  const exact = IPL_TEAMS.find(t => t.name.toLowerCase() === lower)
  if (exact) return exact

  // Abbr match
  const byAbbr = IPL_TEAMS.find(t => t.abbr.toLowerCase() === lower)
  if (byAbbr) return byAbbr

  // Partial: does the stored name contain any word from the query?
  const words = lower.split(/\s+/)
  return IPL_TEAMS.find(t =>
    words.some(w => w.length > 2 && t.name.toLowerCase().includes(w))
  ) ?? null
}
