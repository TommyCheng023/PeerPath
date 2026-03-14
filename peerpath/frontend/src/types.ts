export interface MatchRequest {
  tags: string[];
  description: string;
  user_id?: string;
}

export interface ApiPeerResult {
  rank: number;
  peer_id: string;
  name: string;
  major: string;
  year: string;
  tags: string[];
  tag_overlap: number;
  field_score: number;
  llm_adjustment: number;
  final_score: number;
  reason: string;
  conversation_starter: string;
}

export interface ApiMatchResponse {
  total_candidates: number;
  matches: ApiPeerResult[];
}

export interface MatchCard {
  id: string;
  rank: number;
  name: string;
  major: string;
  year: string;
  tags: string[];
  matchedTags: string[];
  scorePercent: number;
  tagScorePercent: number;
  experienceScorePercent: number;
  explanation: string;
  conversationStarter: string;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface HistoryMatch {
  rank: number;
  peer_id: string;
  name: string;
  major: string;
  year: string;
  tags: string[];
  tag_overlap: number;
  field_score: number;
  llm_adjustment: number;
  final_score: number;
  reason: string;
  conversation_starter: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  tags: string[];
  description: string;
  total_candidates: number;
  matches: HistoryMatch[];
}

export interface HistoryResponse {
  user_id: string;
  entries: HistoryEntry[];
}
