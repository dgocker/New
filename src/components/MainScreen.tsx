import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCallStore } from '../store/callStore';
import { Button } from './ui/Button';
import { Phone, Video, LogOut, UserPlus, Shield, Users, Copy, Check } from 'lucide-react';
import { getSocket, disconnectSocket } from '../services/socket';
import { motion } from 'motion/react';

interface Friend {
  id: string;
  username: string;
  isOnline: boolean;
}

export function MainScreen() {
  const { user, logout, token } = useAuthStore();
  const { setState, setRemoteUser, setIncomingCall } = useCallStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const res = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setFriends(data);
        }
      } catch (e) {
        console.error('Failed to fetch friends', e);
      }
    };

    fetchFriends();

    const socket = getSocket();
    if (!socket) return;

    // We can refetch friends when someone joins or leaves to keep it simple
    const handleStatus = ({ userId, status }: any) => {
      setFriends(prev => prev.map(f => 
        f.id === userId ? { ...f, isOnline: status === 'online' } : f
      ));
      // Also refetch just in case there's a new user
      if (status === 'online') {
        fetchFriends();
      }
    };

    socket.on('user_status', handleStatus);

    socket.on('invite', (data) => {
      const { state } = useCallStore.getState();
      if (state !== 'IDLE') {
        socket.emit('invite_response', { 
          targetUserId: data.from, 
          accepted: false, 
          roomId: data.roomId,
          reason: 'busy'
        });
        return;
      }
      
      setRemoteUser(data.from);
      setIncomingCall({
        from: data.from,
        roomId: data.roomId,
        isVideo: data.isVideo,
        remotePublicKey: data.publicKey
      });
      setState('RINGING');
    });

    return () => {
      socket.off('user_status', handleStatus);
      socket.off('invite');
    };
  }, [token]);

  const handleGenerateInvite = async () => {
    try {
      const res = await fetch('/api/invites/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.code) {
        setInviteLink(`${window.location.origin}/invite/${data.code}`);
        setCopied(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
  };

  const startCall = (friendId: string, isVideo: boolean) => {
    setRemoteUser(friendId);
    setState('CALLING');
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 font-sans">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Shield className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">SecureCall</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-zinc-200">{user?.username}</span>
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500"></span> Online
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={handleLogout} className="border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl grid gap-6 md:grid-cols-[1fr_2fr]">
          
          {/* Sidebar / Actions */}
          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
                  <UserPlus className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-white">Invite Friends</h2>
              </div>
              <p className="mb-4 text-xs text-zinc-400">
                Generate a one-time secure link to invite a contact to this network.
              </p>
              <Button onClick={handleGenerateInvite} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                Generate Link
              </Button>
              
              {inviteLink && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 overflow-hidden"
                >
                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                    <span className="truncate text-xs text-zinc-400 px-2">{inviteLink}</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-white" onClick={copyToClipboard}>
                      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Contacts List */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl flex flex-col"
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
                  <Users className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-white">Contacts</h2>
              </div>
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                {friends.length}
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {friends.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-center">
                  <Users className="mb-2 h-8 w-8 text-zinc-700" />
                  <p className="text-sm text-zinc-500">No contacts found.</p>
                  <p className="text-xs text-zinc-600">Generate an invite link to add someone.</p>
                </div>
              ) : (
                friends.map(friend => (
                  <div key={friend.id} className="group flex items-center justify-between rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-3 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-300">
                          {friend.username.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-zinc-900 ${friend.isOnline ? 'bg-green-500' : 'bg-zinc-600'}`} />
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-zinc-200">{friend.username}</span>
                        <span className="block text-xs text-zinc-500">{friend.isOnline ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                    
                    {friend.isOnline && (
                      <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100">
                        <Button size="icon" variant="outline" className="h-9 w-9 rounded-full border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white" onClick={() => startCall(friend.id, false)}>
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-9 w-9 rounded-full border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-500" onClick={() => startCall(friend.id, true)}>
                          <Video className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>

        </div>
      </main>
    </div>
  );
}
