import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';

import { Error as ErrorAlert } from '#components/alerts';
import { Link } from '#components/common/Link';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import { FormField, FormLabel } from '#components/forms';
import type { Modal as ModalType } from '#modals/modalsSlice';

/*
  TRACKIE wizard replacing upstream's single-screen Akahu token form. Each NZ
  user pastes their own my.akahu.nz personal tokens (stored per user, encrypted)
  rather than an admin setting one global pair, so this walks them through Akahu's
  setup steps. Errors come from the akahu-set-tokens response, not upstream's
  getSecretsError helper (master-only, absent from our base tag).
*/

type AkahuInitialiseModalProps = Extract<
  ModalType,
  { name: 'akahu-init' }
>['options'];

const APP_TOKEN_PREFIX = 'app_token_';
const USER_TOKEN_PREFIX = 'user_token_';

/**
 * The my.akahu.nz steps the user completes before they have tokens to paste.
 * Screenshots are a pending asset task (they need a live Akahu account), so each
 * step shows a labelled placeholder until the real captures are dropped in.
 */
type GuideStep = { title: string; body: React.ReactNode; screenshot: string };

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        minHeight: 96,
        borderRadius: 6,
        border: `1px dashed ${theme.tableBorder}`,
        backgroundColor: theme.tableBackground,
      }}
    >
      <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}

export const AkahuInitialiseModal = ({
  onSuccess,
}: AkahuInitialiseModalProps) => {
  const { t } = useTranslation();

  const guideSteps: GuideStep[] = [
    {
      title: t('Create your Akahu account'),
      body: (
        <Trans>
          Open{' '}
          <Link variant="external" to="https://my.akahu.nz/developers" linkColor="purple">
            my.akahu.nz
          </Link>{' '}
          and sign up, or log in if you already have an account.
        </Trans>
      ),
      screenshot: t('Screenshot: my.akahu.nz sign-up'),
    },
    {
      title: t('Connect your bank'),
      body: (
        <Trans>
          In Akahu, connect the New Zealand bank account(s) you want to track.
          Akahu only ever has read access to your transactions.
        </Trans>
      ),
      screenshot: t('Screenshot: connecting a bank in Akahu'),
    },
    {
      title: t('One-time developer setup'),
      body: (
        <Trans>
          Akahu asks every personal-token user to accept its Developer Terms,
          verify your identity and set up two-factor authentication. This is
          required by Akahu and you only do it once.
        </Trans>
      ),
      screenshot: t('Screenshot: Akahu developer terms'),
    },
    {
      title: t('Copy your two tokens'),
      body: (
        <Trans>
          Open{' '}
          <Link
            variant="external"
            to="https://my.akahu.nz/developers"
            linkColor="purple"
          >
            my.akahu.nz/developers
          </Link>{' '}
          and copy your <Text style={{ fontWeight: 600 }}>App ID Token</Text>{' '}
          and <Text style={{ fontWeight: 600 }}>User Access Token</Text>. You
          paste both on the next step.
        </Trans>
      ),
      screenshot: t('Screenshot: my.akahu.nz/developers tokens'),
    },
  ];

  // One step per guide screen, plus a final screen to paste the two tokens.
  const lastStep = guideSteps.length;
  const [step, setStep] = useState(0);

  const [appToken, setAppToken] = useState('');
  const [userToken, setUserToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onConnect = async (close: () => void) => {
    if (!appToken.trim() || !userToken.trim()) {
      setError(t('Both the App ID Token and the User Access Token are required'));
      return;
    }
    if (!appToken.startsWith(APP_TOKEN_PREFIX)) {
      setError(t('The App ID Token should start with "app_token_"'));
      return;
    }
    if (!userToken.startsWith(USER_TOKEN_PREFIX)) {
      setError(t('The User Access Token should start with "user_token_"'));
      return;
    }

    setIsLoading(true);
    /* send() resolves with empty data on success and rejects on a non-ok
       response, so treat a clean resolve as success - the `status` field never
       reaches us here. */
    try {
      const result = (await send('akahu-set-tokens', {
        appToken: appToken.trim(),
        userToken: userToken.trim(),
      })) as unknown as { error?: string } | undefined;
      setIsLoading(false);

      if (result?.error) {
        setError(result.error);
        return;
      }

      setError(null);
      onSuccess();
      close();
    } catch (err) {
      setIsLoading(false);
      setError(
        err instanceof Error && err.message
          ? err.message
          : t(
              'Could not save your Akahu tokens. Please check them and try again.',
            ),
      );
    }
  };

  return (
    <Modal name="akahu-init" containerProps={{ style: { width: 400 } }}>
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Set up Akahu bank sync')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          <View style={{ display: 'flex', gap: 12 }}>
            <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
              {t('Step {{current}} of {{total}}', {
                current: step + 1,
                total: lastStep + 1,
              })}
            </Text>

            {step < lastStep ? (
              <>
                <Text style={{ fontWeight: 600 }}>{guideSteps[step].title}</Text>
                <Text>{guideSteps[step].body}</Text>
                <ScreenshotPlaceholder label={guideSteps[step].screenshot} />
              </>
            ) : (
              <>
                <Text>
                  <Trans>
                    Paste the two tokens from your my.akahu.nz developer page.
                  </Trans>
                </Text>

                <FormField>
                  <FormLabel
                    title={t('App ID Token:')}
                    htmlFor="appToken-field"
                  />
                  <Input
                    id="appToken-field"
                    type="password"
                    value={appToken}
                    placeholder={APP_TOKEN_PREFIX + '…'}
                    onChangeValue={value => {
                      setAppToken(value);
                      setError(null);
                    }}
                  />
                </FormField>

                <FormField>
                  <FormLabel
                    title={t('User Access Token:')}
                    htmlFor="userToken-field"
                  />
                  <Input
                    id="userToken-field"
                    type="password"
                    value={userToken}
                    placeholder={USER_TOKEN_PREFIX + '…'}
                    onChangeValue={value => {
                      setUserToken(value);
                      setError(null);
                    }}
                  />
                </FormField>
              </>
            )}

            {error && <ErrorAlert>{error}</ErrorAlert>}
          </View>

          <ModalButtons>
            {step > 0 && (
              <Button
                style={{ marginRight: 10 }}
                onPress={() => {
                  setError(null);
                  setStep(s => s - 1);
                }}
              >
                <Trans>Back</Trans>
              </Button>
            )}

            {step < lastStep ? (
              <Button
                variant="primary"
                autoFocus
                onPress={() => setStep(s => s + 1)}
              >
                <Trans>Next</Trans>
              </Button>
            ) : (
              <ButtonWithLoading
                variant="primary"
                autoFocus
                isLoading={isLoading}
                onPress={() => {
                  void onConnect(() => state.close());
                }}
              >
                <Trans>Connect</Trans>
              </ButtonWithLoading>
            )}
          </ModalButtons>
        </>
      )}
    </Modal>
  );
};
