<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { LogIn, LogOut, UserPlus } from '@lucide/vue';
import { currentIdentity, IdentityApiError, login, logout, register } from '@/services/identity';
import type { Identity } from '@/types/identity';

const props = defineProps<{ mode: 'account' | 'login' | 'register' }>();
const router = useRouter();
const identity = ref<Identity | null>(null);
const loading = ref(true);
const pending = ref(false);
const error = ref('');
const fields = ref<string[]>([]);
type IdentityField = 'name' | 'email' | 'password' | 'password_confirmation';
const localIssues = ref<Partial<Record<IdentityField, string>>>({});
const errorRegion = ref<HTMLElement | null>(null);
const name = ref('');
const email = ref('');
const password = ref('');
const confirmation = ref('');
const title = computed(() => props.mode === 'register' ? 'Create account' : props.mode === 'login' ? 'Sign in' : 'Your account');
const serverIssues = computed<Record<IdentityField, string>>(() => ({
  name: 'Enter a name of up to 255 characters.',
  email: props.mode === 'login' ? 'Check your email and password.' : 'Check this email address or sign in to an existing account.',
  password: props.mode === 'register' ? 'Use at least 12 characters and at most 72 UTF-8 bytes.' : 'Check your password and try again.',
  password_confirmation: 'Enter the same password in both fields.',
}));
const passwordDescription = computed(() => [props.mode === 'register' ? 'password-bounds' : '', issue('password') ? 'password-error' : ''].filter(Boolean).join(' ') || undefined);
let controller = new AbortController();

function issue(field: IdentityField): string {
  return localIssues.value[field] ?? (fields.value.includes(field) ? serverIssues.value[field] : '');
}

async function focusError() {
  await nextTick();
  errorRegion.value?.focus();
}

async function showError(failure: unknown) {
  error.value = failure instanceof IdentityApiError ? failure.message : 'Unable to access your account right now.';
  fields.value = failure instanceof IdentityApiError ? failure.fields : [];
  await focusError();
}

async function load() {
  controller.abort();
  controller = new AbortController();
  const signal = controller.signal;
  loading.value = true;
  pending.value = false;
  identity.value = null;
  error.value = '';
  fields.value = [];
  localIssues.value = {};
  password.value = confirmation.value = '';
  try {
    const user = await currentIdentity(signal);
    if (signal.aborted) return;
    identity.value = user;
    if (user && props.mode !== 'account') await router.replace('/account');
    else if (!user && props.mode === 'account') await router.replace('/login');
  } catch (failure) {
    if (!signal.aborted) await showError(failure);
  } finally { if (!signal.aborted) loading.value = false; }
}

async function submit() {
  if (pending.value || loading.value) return;
  const signal = controller.signal;
  error.value = '';
  fields.value = [];
  localIssues.value = {};
  if (props.mode !== 'account') {
    if (password.value.includes('\0')) localIssues.value.password = 'Remove null characters from the password.';
    else if (new TextEncoder().encode(password.value).length > 72) localIssues.value.password = 'Use a password of at most 72 UTF-8 bytes.';
    else if (props.mode === 'register' && Array.from(password.value).length < 12) localIssues.value.password = 'Use at least 12 characters.';
    if (props.mode === 'register' && password.value !== confirmation.value) localIssues.value.password_confirmation = 'Enter the same password in both fields.';
    if (Object.keys(localIssues.value).length > 0) {
      error.value = 'Check the highlighted fields.';
      await focusError();
      return;
    }
  }
  pending.value = true;
  try {
    if (props.mode === 'account') await logout(signal);
    else if (props.mode === 'register') await register({ name: name.value, email: email.value, password: password.value, password_confirmation: confirmation.value }, signal);
    else await login({ email: email.value, password: password.value }, signal);
    if (!signal.aborted) await router.replace(props.mode === 'account' ? '/login' : '/account');
  } catch (failure) {
    if (!signal.aborted) {
      password.value = confirmation.value = '';
      if (failure instanceof IdentityApiError && failure.status === 401) {
        identity.value = null;
        await router.replace('/login');
      } else await showError(failure);
    }
  } finally { if (!signal.aborted) pending.value = false; }
}

watch(() => props.mode, load, { immediate: true });
onScopeDispose(() => { controller.abort(); password.value = confirmation.value = ''; });
</script>

<template>
  <section class="identity-section" :aria-busy="loading || pending">
    <h1>{{ title }}</h1>
    <p v-if="loading" role="status">Loading your account...</p>
    <div v-if="error" ref="errorRegion" class="identity-error" role="alert" tabindex="-1">
      <p>{{ error }}</p>
      <button v-if="!identity && mode === 'account'" type="button" @click="load">Try again</button>
    </div>
    <template v-if="!loading && identity && mode === 'account'">
      <dl class="identity-details"><dt>Name</dt><dd>{{ identity.name }}</dd><dt>Email</dt><dd>{{ identity.email }}</dd></dl>
      <button class="identity-command" type="button" :disabled="pending" @click="submit"><LogOut aria-hidden="true" :size="18" />{{ pending ? 'Signing out...' : 'Sign out' }}</button>
      <RouterLink class="identity-link" to="/">Browse characters</RouterLink>
    </template>
    <form v-else-if="!loading && mode !== 'account'" class="identity-form" @submit.prevent="submit">
      <fieldset :disabled="pending">
        <div v-if="mode === 'register'" class="identity-field">
          <label for="identity-name">Name</label>
          <input id="identity-name" v-model="name" name="name" autocomplete="name" required maxlength="255" :aria-invalid="Boolean(issue('name'))" :aria-describedby="issue('name') ? 'name-error' : undefined" />
          <small v-if="issue('name')" id="name-error" class="identity-field-error">{{ issue('name') }}</small>
        </div>
        <div class="identity-field">
          <label for="identity-email">Email</label>
          <input id="identity-email" v-model="email" name="email" type="email" autocomplete="username" required maxlength="254" :aria-invalid="Boolean(issue('email'))" :aria-describedby="issue('email') ? 'email-error' : undefined" />
          <small v-if="issue('email')" id="email-error" class="identity-field-error">{{ issue('email') }}</small>
        </div>
        <div class="identity-field">
          <label for="identity-password">Password</label>
          <input id="identity-password" v-model="password" name="password" type="password" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" required :minlength="mode === 'register' ? 12 : 1" maxlength="72" :aria-invalid="Boolean(issue('password'))" :aria-describedby="passwordDescription" />
          <small v-if="mode === 'register'" id="password-bounds">At least 12 characters, up to 72 UTF-8 bytes.</small>
          <small v-if="issue('password')" id="password-error" class="identity-field-error">{{ issue('password') }}</small>
        </div>
        <div v-if="mode === 'register'" class="identity-field">
          <label for="identity-confirmation">Confirm password</label>
          <input id="identity-confirmation" v-model="confirmation" name="password_confirmation" type="password" autocomplete="new-password" required minlength="12" maxlength="72" :aria-invalid="Boolean(issue('password_confirmation'))" :aria-describedby="issue('password_confirmation') ? 'confirmation-error' : undefined" />
          <small v-if="issue('password_confirmation')" id="confirmation-error" class="identity-field-error">{{ issue('password_confirmation') }}</small>
        </div>
        <button class="identity-command" type="submit"><UserPlus v-if="mode === 'register'" aria-hidden="true" :size="18" /><LogIn v-else aria-hidden="true" :size="18" />{{ pending ? 'Please wait...' : title }}</button>
      </fieldset>
      <RouterLink class="identity-link" :to="mode === 'register' ? '/login' : '/register'">{{ mode === 'register' ? 'Already have an account? Sign in' : 'Create an account' }}</RouterLink>
    </form>
  </section>
</template>
