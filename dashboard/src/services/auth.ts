import { apiClient } from './axios';
import { API_ENDPOINTS } from './endpoints';
import type { StoredActionPermissions } from '@/utils/pagePermissions';

interface LoginResponse {
  success: boolean;
  token: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    roles: string[];
    designation?: string;
    pageAccess?: string[];
    actionPermissions?: StoredActionPermissions;
  };
}

export interface ProfileResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: { id: string; name: string } | null;
  roles: string[];
  designation?: string;
  pageAccess?: string[];
  actionPermissions?: StoredActionPermissions;
}

export const authService = {
  login: async (email: string, password: string) => {
    const { data } = await apiClient.post<LoginResponse>(API_ENDPOINTS.auth.login, { email, password });
    localStorage.setItem('token', data.token);
    return data;
  },
  logout: async () => {
    try { 
      await apiClient.post(API_ENDPOINTS.auth.logout); 
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally { 
      localStorage.removeItem('token'); 
    }
  },
  profile: async () => {
    const { data } = await apiClient.get<{ success: boolean; data: ProfileResponse }>(API_ENDPOINTS.auth.profile);
    return data.data;
  },
  updateProfile: async (name: string, phone: string) => {
    const { data } = await apiClient.patch<{ success: boolean; data: ProfileResponse }>(API_ENDPOINTS.auth.profile, { name, phone });
    return data.data;
  },
};
