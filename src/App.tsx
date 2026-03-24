/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useCallStore } from './store/callStore';
import { AuthScreen } from './components/AuthScreen';
import { MainScreen } from './components/MainScreen';
import { CallScreen } from './components/CallScreen';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function InviteRoute() {
  const { code } = useParams();
  return <AuthScreen initialInviteCode={code} isLoginMode={false} />;
}

export default function App() {
  const { state } = useCallStore();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthScreen isLoginMode={true} />} />
        <Route path="/register" element={<AuthScreen isLoginMode={false} />} />
        <Route path="/invite/:code" element={<InviteRoute />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <MainScreen />
              {state !== 'IDLE' && <CallScreen />}
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
