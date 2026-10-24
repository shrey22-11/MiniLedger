import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import type { Loan, Receipt, Session, Summary } from './types';

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000')
).replace(/\/$/, '');
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData))
      headers.set('Content-Type', 'application/json');
    // Expo's native fetch understands File objects in multipart requests.
    // The React Native { uri, name, type } workaround can fail on Android.
    const fetcher = Platform.OS !== 'web' && options.body instanceof FormData ? expoFetch : fetch;
    const response = await fetcher(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new ApiError(data.error || 'Request failed. Please try again.', response.status);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(
      `Cannot reach the server at ${API_URL}. Check that it is running and your device is on the same Wi-Fi.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  requestOtp: (phone: string) =>
    request<{ message: string; retryAfterSeconds: number }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, otp: string) =>
    request<Session>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) }),
  me: (token: string) => request<{ user: Session['user'] }>('/me', {}, token),
  loans: (token: string) => request<{ entries: Loan[]; today: string }>('/loans', {}, token),
  summary: (token: string) => request<Summary>('/summary', {}, token),
  repay: (token: string, id: string) => request(`/loans/${id}/repay`, { method: 'PATCH' }, token),
  async addLoan(
    token: string,
    input: { friendName: string; amount: string; dueDate: string },
    receipt: Receipt | null,
  ) {
    if (!receipt) return request('/loans', { method: 'POST', body: JSON.stringify(input) }, token);
    const form = new FormData();
    Object.entries(input).forEach(([key, value]) => form.append(key, value));
    if (Platform.OS === 'web') {
      const blob = await (await fetch(receipt.uri)).blob();
      form.append('receipt', blob, receipt.name);
    } else form.append('receipt', new File(receipt.uri), receipt.name);
    return request('/loans', { method: 'POST', body: form }, token);
  },
};
