'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendEmailVerification } from 'firebase/auth';
import { accountErrorMessage, emailActionSettings, newPasswordSchema } from '@/lib/account-security';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AtSign, Lock, Ticket } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  initiateEmailSignIn,
  initiateEmailSignUp,
  initiateGoogleSignIn,
} from '@/firebase/non-blocking-login';
import { useAuth } from '@/firebase';
import { Logo } from '@/components/icons/logo';
import { BrandTypewriter } from '@/components/prompt-refinery/brand-typewriter';

const signUpSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: newPasswordSchema,
  confirmPassword: z.string(),
  promoCode: z.string().trim().max(100).optional(),
}).refine(value => value.password === value.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match.' });

const signInSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

export function LoginPage({ showBrandMessage = false }: { showBrandMessage?: boolean }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();

  const signUpForm = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirmPassword: '', promoCode: '' },
  });

  const signInForm = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleAuthError = (error: unknown) => {
    toast({
      variant: 'destructive',
      title: 'Authentication Failed',
      description: accountErrorMessage(error),
    });
  };

  const onSignUp = async (values: z.infer<typeof signUpSchema>) => {
    setIsLoading(true);
    try {
      const credential = await initiateEmailSignUp(auth, values.email, values.password);
      try {
        await sendEmailVerification(credential.user, emailActionSettings(window.location.origin));
        toast({ title: 'Verify your email', description: 'We sent a verification link to your signup email. Open it to confirm your account.' });
      } catch {
        toast({ title: 'Account created', description: 'The verification email could not be sent. Use Resend verification email in Settings.' });
      }
      if (values.promoCode?.trim()) {
        try {
          const response = await fetch('/api/promo/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await credential.user.getIdToken()}` },
            body: JSON.stringify({ code: values.promoCode }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error?.message || 'Promo code could not be redeemed.');
          toast({ title: 'Promo Pro Activated', description: 'Your account now has Pro access.' });
        } catch (promoError) {
          toast({ title: 'Account Created on Free', description: promoError instanceof Error ? promoError.message : 'The promo code was not applied.' });
        }
      }
    } catch (error) {
      handleAuthError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const onSignIn = async (values: z.infer<typeof signInSchema>) => {
    setIsLoading(true);
    try {
      await initiateEmailSignIn(auth, values.email, values.password);
    } catch (error) {
      handleAuthError(error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const onSignInWithGoogle = async (promoCode?: string) => {
    setIsLoading(true);
    try {
      if (promoCode?.trim()) sessionStorage.setItem('clarift-pending-promo', promoCode.trim());
      const credential = await initiateGoogleSignIn(auth);
      if (credential?.user && promoCode?.trim()) {
        const response = await fetch('/api/promo/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await credential.user.getIdToken()}` },
          body: JSON.stringify({ code: promoCode }),
        });
        sessionStorage.removeItem('clarift-pending-promo');
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'Promo code could not be redeemed.');
        toast({ title: 'Promo Pro Activated', description: 'Your account now has Pro access.' });
      }
    } catch (error) {
      handleAuthError(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md space-y-6 px-4 py-6">
        <div className="flex justify-center">
          <Logo variant="wordmark" className="h-20 w-64" />
          <h1 className="sr-only">Sign in to Clarift</h1>
        </div>
        {showBrandMessage && <BrandTypewriter />}
      <Tabs defaultValue="sign-in" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sign-in">Sign In</TabsTrigger>
          <TabsTrigger value="sign-up">Sign Up</TabsTrigger>
        </TabsList>
        <TabsContent value="sign-in">
          <Card>
            <CardHeader>
              <CardTitle>Welcome Back</CardTitle>
              <CardDescription>
                Sign in to access your saved prompts.
              </CardDescription>
            </CardHeader>
            <Form {...signInForm}>
              <form onSubmit={signInForm.handleSubmit(onSignIn)}>
                <CardContent className="space-y-4">
                  <FormField
                    control={signInForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="email"
                              placeholder="you@example.com"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signInForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="password"
                              placeholder="••••••••"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Link href="/auth/forgot-password" className="text-sm text-primary underline">Forgot password?</Link>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing In...' : 'Sign In'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => onSignInWithGoogle()}
                    disabled={isLoading}
                  >
                    Continue with Google
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </TabsContent>
        <TabsContent value="sign-up">
          <Card>
            <CardHeader>
              <CardTitle>Create an Account</CardTitle>
              <CardDescription>
                Sign up to start refining and saving your prompts.
              </CardDescription>
            </CardHeader>
            <Form {...signUpForm}>
              <form onSubmit={signUpForm.handleSubmit(onSignUp)}>
                <CardContent className="space-y-4">
                  <FormField
                    control={signUpForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                           <div className="relative">
                            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="email"
                              placeholder="you@example.com"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUpForm.control}
                    name="promoCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Promo Code <span className="text-muted-foreground">(optional)</span></FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Ticket className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="CLARIFT-..." className="pl-10 uppercase" autoComplete="off" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUpForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="password"
                              placeholder="••••••••"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <FormField control={signUpForm.control} name="confirmPassword" render={({ field }) => (
                    <FormItem className="w-full"><FormLabel>Confirm password</FormLabel><FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating Account...' : 'Sign Up'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => onSignInWithGoogle(signUpForm.getValues('promoCode'))}
                    disabled={isLoading}
                  >
                    Continue with Google
                  </Button>
                  <Link href="/auth/forgot-password" className="text-sm text-primary underline">Already have an account? Reset your password</Link>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
