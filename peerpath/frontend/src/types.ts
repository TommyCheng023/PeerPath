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
  contact_phone: string;
  contact_email: string;
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
  contactPhone: string;
  contactEmail: string;
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
  contact_phone: string;
  contact_email: string;
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
  source?: "form" | "agent";
}

export interface HistoryResponse {
  user_id: string;
  entries: HistoryEntry[];
}

export interface ChatMessage {
  message_id: string;
  sender_id: string;
  content: string;
  timestamp: string;
  is_opener: boolean;
}

export interface ChatThread {
  thread_id: string;
  peer_id: string;
  peer_name: string;
  peer_major: string;
  peer_year: string;
  created_from_match: boolean;
  match_score: number;
  match_reason: string;
  created_at: string;
  last_message_at: string;
  unread_count: number;
  messages: ChatMessage[];
}

export interface ThreadsResponse {
  threads: ChatThread[];
}

export interface UserProfile {
  id: string;
  name: string;
  major: string;
  year: string;
  tags: string[];
  past_challenges: Array<{
    raw: string;
    parsed: {
      context: string;
      struggle_type: string;
      emotional_signal: string;
      resolution_type: string;
    };
  }>;
  help_topics: string[];
  comfort_level: string;
  contact_phone: string;
  contact_email: string;
  searchable: boolean;
  profile_complete: boolean;
}

export interface AgentMessage {
  role: "agent" | "user";
  content: string;
}

export interface AgentMatchResult {
  rank: number;
  peer_id: string;
  name: string;
  major: string;
  year: string;
  contact_phone: string;
  contact_email: string;
  tags: string[];
  tag_overlap: number;
  field_score: number;
  llm_adjustment: number;
  final_score: number;
  reason: string;
  conversation_starter: string;
}

export interface AgentChatResponse {
  session_id: string;
  reply: string;
  done: boolean;
  matches: AgentMatchResult[] | null;
  query_tags?: string[] | null;
  query_description?: string | null;
}
