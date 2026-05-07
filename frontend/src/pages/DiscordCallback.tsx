import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, BASE_URL } from '../api/api';

export default function DiscordCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your Discord account...');
  const [userData, setUserData] = useState<any>(null);
  const [roleStatus, setRoleStatus] = useState<'loading' | 'success' | 'not_in_server'>('loading');
  const [isVerifyingAgain, setIsVerifyingAgain] = useState(false);

  const called = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code || called.current) return;
    called.current = true;

    const verifyDiscord = async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/discord/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirect_uri: window.location.origin + '/discord-callback'
          }),
        });

        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setUserData(data.user);

          // Save session
          localStorage.setItem('disperser_user', JSON.stringify(data.user));

          if (data.roleGiven) {
            setRoleStatus('success');
            setMessage(`Successfully verified! You have been given the verified role in our server.`);
            // Auto redirect only if role is given
            setTimeout(() => {
              window.location.href = '/dashboard';
            }, 2000);
          } else {
            setRoleStatus('not_in_server');
            setMessage(`Authenticated as ${data.user.username}, but you are not in our Discord server yet.`);
          }
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to verify with Discord.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('A network error occurred during verification.');
      }
    };

    verifyDiscord();
  }, [searchParams]);

  const handleRetryVerify = async () => {
    if (!userData) return;
    setIsVerifyingAgain(true);
    try {
      const response = await fetch(`${BASE_URL}/api/discord/verify-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id }),
      });
      const data = await response.json();
      if (data.success) {
        setRoleStatus('success');
        setMessage('Great! You are now verified in our server.');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      } else {
        alert('We still cannot find you in the server. Please make sure you have joined!');
      }
    } catch (err) {
      alert('Verification error. Please try again later.');
    } finally {
      setIsVerifyingAgain(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
      <Card className="w-full max-w-md bg-slate-900/60 border-slate-800 backdrop-blur-xl shadow-2xl">
        <CardContent className="pt-10 pb-8 px-8 flex flex-col items-center text-center">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-6">
                <Loader2 size={32} className="text-cyan-400 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Verifying...</h2>
              <p className="text-slate-400 text-sm">{message}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
                {roleStatus === 'success' ? (
                  <CheckCircle2 size={32} className="text-emerald-400" />
                ) : (
                  <MessageSquare size={32} className="text-cyan-400" />
                )}
              </div>

              <h2 className="text-xl font-bold text-white mb-2">
                {roleStatus === 'success' ? 'Verification Successful!' : 'Join Our Community'}
              </h2>

              {userData && (
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 mb-4 flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center overflow-hidden border border-slate-800">
                    {userData.avatar ? (
                      <img src={`https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`} alt="avatar" />
                    ) : (
                      <MessageSquare size={20} className="text-indigo-400" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-white">{userData.username}</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Authenticated</div>
                  </div>
                </div>
              )}

              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                {message}
              </p>

              {roleStatus === 'not_in_server' ? (
                <div className="space-y-3 w-full">
                  <Button
                    onClick={() => window.open('https://discord.gg/2dRtqgmKPR', '_blank')}
                    className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold h-12"
                  >
                    1. Join Discord Server
                  </Button>
                  <Button
                    onClick={handleRetryVerify}
                    disabled={isVerifyingAgain}
                    className="w-full bg-white text-black hover:bg-slate-100 font-bold h-12"
                  >
                    {isVerifyingAgain ? (
                      <Loader2 className="animate-spin mr-2" size={18} />
                    ) : null}
                    2. I've Joined, Verify Me
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => window.location.href = '/dashboard'}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 font-bold h-12"
                >
                  Return to Dashboard
                </Button>
              )}
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                <AlertCircle size={32} className="text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Verification Failed</h2>
              <p className="text-slate-400 text-sm mb-8">{message}</p>
              <Button
                onClick={() => window.location.href = '/login'}
                variant="outline"
                className="w-full border-slate-800 text-slate-300 hover:bg-slate-800 font-bold h-12"
              >
                Back to Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
