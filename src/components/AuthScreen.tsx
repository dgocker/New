import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuthStore } from '../store/authStore';
import { Shield, Lock, User, KeyRound } from 'lucide-react';
import { motion } from 'motion/react';

interface AuthScreenProps {
  isLoginMode?: boolean;
  initialInviteCode?: string;
}

export function AuthScreen({ isLoginMode = true, initialInviteCode = '' }: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const setAuth = useAuthStore(state => state.setAuth);
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      navigate('/', { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
      const body = isLoginMode 
        ? { username, password }
        : { username, password, inviteCode };
        
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }
      
      setAuth(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl"
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {isLoginMode ? 'Welcome back' : 'Join SecureCall'}
          </h1>
          <p className="mt-2 text-sm text-zinc-400 text-center">
            {isLoginMode 
              ? 'Enter your credentials to access your secure calls.' 
              : 'End-to-end encrypted calls. Invite code required.'}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-500">
                <User className="h-5 w-5" />
              </div>
              <Input 
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                disabled={loading}
                className="pl-10 bg-zinc-950 border-zinc-800 text-white focus:border-indigo-500 focus:ring-indigo-500/20"
                placeholder="johndoe"
              />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-500">
                <Lock className="h-5 w-5" />
              </div>
              <Input 
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
                className="pl-10 bg-zinc-950 border-zinc-800 text-white focus:border-indigo-500 focus:ring-indigo-500/20"
                placeholder="••••••••"
              />
            </div>
          </div>
          
          {!isLoginMode && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-1.5 overflow-hidden"
            >
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Invite Code</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-500">
                  <KeyRound className="h-5 w-5" />
                </div>
                <Input 
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 bg-zinc-950 border-zinc-800 text-white focus:border-indigo-500 focus:ring-indigo-500/20"
                  placeholder="xxxx-xxxx"
                />
              </div>
            </motion.div>
          )}
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20"
            >
              {error}
            </motion.div>
          )}
          
          <Button 
            type="submit" 
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition-all" 
            disabled={loading}
          >
            {loading ? 'Processing...' : (isLoginMode ? 'Sign In' : 'Create Account')}
          </Button>
        </form>
        
        <div className="mt-8 text-center">
          {isLoginMode ? (
            <p className="text-sm text-zinc-400">
              Don't have an account?{' '}
              <Link to="/register" className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                Register here
              </Link>
            </p>
          ) : (
            <p className="text-sm text-zinc-400">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                Sign in
              </Link>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
