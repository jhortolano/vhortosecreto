import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { fetchProfile, isProfileComplete } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { savePushToken } from '@/lib/notifications';
import { uploadAvatarFromUri } from '@/lib/uploadAvatar';
import { countries, findCountryByDial, type Country } from '@/lib/countries';
import { useT } from '@/lib/i18n';
import { useThemeColors } from '@/hooks/useThemeColors';
import { lightColors } from '@/constants/colors';
import { getUserId, getProfileWithCache } from '@/lib/offline';
import { loadCache } from '@/lib/encuestasCache';

export default function CompleteProfileScreen() {
  const { t } = useT();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedCountry, setSelectedCountry] = useState<Country>(countries[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [pickedAsset, setPickedAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [remoteAvatarUrl, setRemoteAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    const load = async () => {
      setErrorMessage('');

      const cached = await loadCache();
      if (cached?.profile && isProfileComplete(cached.profile)) {
        router.replace('/groups');
        return;
      }

      const userId = await getUserId();
      if (!userId) {
        setIsLoading(false);
        router.replace('/');
        return;
      }

      const profile = await getProfileWithCache(userId);
      if (profile && isProfileComplete(profile)) {
        router.replace('/groups');
        return;
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (user) setEmail(user.email ?? '');
      } catch {}

      try {
        const profile = await fetchProfile(userId);
        if (profile) {
          const storedPhone = profile.phone ?? '';
          const country = findCountryByDial(storedPhone);
          if (country) {
            setSelectedCountry(country);
            setPhoneNumber(storedPhone.slice(country.dial.length));
          } else {
            setPhoneNumber(storedPhone);
          }
          setNick(profile.nick ?? '');
          setRemoteAvatarUrl(profile.avatar_url ?? null);
        }
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : t('errorLoadingProfile'));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const pickFromLibrary = async () => {
    setErrorMessage('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage(t('galleryPermission'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;
    setPickedAsset(result.assets[0]);
  };

  const saveProfile = async () => {
    setErrorMessage('');
    const fullPhone = `${selectedCountry.dial}${phoneNumber.replace(/\s/g, '')}`;
    const trimmedNick = nick.trim();

    if (!phoneNumber.trim() || !trimmedNick) {
      setErrorMessage(t('fillAllFields'));
      return;
    }

    setIsSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsSaving(false);
      router.replace('/');
      return;
    }

    try {
      let avatarUrl = remoteAvatarUrl;
      if (pickedAsset) {
        avatarUrl = await uploadAvatarFromUri(user.id, pickedAsset.uri, pickedAsset.mimeType);
      }

      const row = {
        id: user.id,
        email: user.email ?? email,
        phone: fullPhone,
        nick: trimmedNick,
        avatar_url: avatarUrl,
      };

      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' });

      if (error) {
        setErrorMessage(error.message);
        setIsSaving(false);
        return;
      }

      savePushToken(user.id);

      Promise.all([
        supabase.from('encuestas_usuarios').update({ nick_usuario: trimmedNick }).eq('phone_usuario', fullPhone),
        supabase.from('grupos_miembros').update({ nick: trimmedNick }).eq('phone', fullPhone),
      ]).catch((e) => console.warn('[REGISTER] Error actualizando nicks pendientes:', e));

      router.replace('/groups');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : t('errorLoadingImage'));
    } finally {
      setIsSaving(false);
    }
  };

  const previewUri = pickedAsset?.uri ?? remoteAvatarUrl;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
        <Text style={styles.helper}>{t('loadingProfile')}</Text>
      </View>
    );
  }

  return (
    <>
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <Text style={styles.title}>{t('profileTitle')}</Text>
        <Text style={styles.subtitle}>{t('profileSubtitle')}</Text>

        <Text style={styles.label}>{t('emailLabel')}</Text>
        <TextInput style={[styles.input, styles.inputDisabled]} value={email} editable={false} />

        <Text style={styles.label}>{t('phoneLabel')}</Text>
        <View style={styles.phoneRow}>
          <Pressable style={styles.countryPicker} onPress={() => setShowCountryPicker(true)}>
            <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
            <Text style={styles.countryDial}>{selectedCountry.dial}</Text>
            <Text style={styles.countryArrow}>▼</Text>
          </Pressable>
          <TextInput
            style={styles.phoneInput}
            placeholder="600000000"
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
        </View>

        <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('selectCountry')}</Text>
                <Pressable onPress={() => setShowCountryPicker(false)}>
                  <Text style={styles.modalClose}>{t('close')}</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder={t('searchCountry')}
                autoCapitalize="none"
                autoCorrect={false}
                value={countrySearch}
                onChangeText={setCountrySearch}
              />
              <FlatList
                data={countrySearch.trim()
                  ? countries.filter((c) =>
                      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                      c.dial.includes(countrySearch) ||
                      c.code.toLowerCase().includes(countrySearch.toLowerCase())
                    )
                  : countries
                }
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.countryItem, item.code === selectedCountry.code && styles.countryItemActive]}
                    onPress={() => {
                      setSelectedCountry(item);
                      setShowCountryPicker(false);
                      setCountrySearch('');
                    }}
                  >
                    <Text style={styles.countryItemFlag}>{item.flag}</Text>
                    <Text style={styles.countryItemName}>{item.name}</Text>
                    <Text style={styles.countryItemDial}>{item.dial}</Text>
                  </Pressable>
                )}
              />
            </View>
          </View>
        </Modal>

        <Text style={styles.label}>{t('nickLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('nickPlaceholder')}
          autoCapitalize="none"
          value={nick}
          onChangeText={setNick}
        />

        <Text style={styles.label}>{t('profileImage')}</Text>
        <Pressable style={styles.pickButton} onPress={pickFromLibrary}>
          <Text style={styles.pickButtonText}>{t('pickFromGallery')}</Text>
        </Pressable>

        {!!previewUri && (
          <View style={styles.previewWrap}>
            <Image source={{ uri: previewUri }} style={styles.previewImage} />
          </View>
        )}

        <View style={styles.consentSection}>
          <Pressable style={styles.checkboxRow} onPress={() => setAcceptedTerms(!acceptedTerms)}>
            <MaterialIcons
              name={acceptedTerms ? 'check-box' : 'check-box-outline-blank'}
              size={24}
              color={acceptedTerms ? '#1F6FEB' : '#888'}
            />
            <Text style={styles.checkboxLabel}>
              Acepto la{' '}
              <Text style={styles.checkboxLink} onPress={() => setShowPrivacyModal(true)}>
                {t('privacyPolicy')}
              </Text>.
            </Text>
          </Pressable>

          <Pressable style={styles.termsToggle} onPress={() => setShowTerms(!showTerms)}>
            <Text style={styles.termsToggleText}>
              {showTerms ? t('hideTerms') : t('viewTerms')}
            </Text>
            <Text style={styles.termsToggleArrow}>{showTerms ? '▲' : '▼'}</Text>
          </Pressable>

          {showTerms && (
            <View style={styles.termsInfo}>
              <Text style={styles.termsBody}>
                <Text style={styles.termsBold}>Responsable:</Text> Julián Hortolano.{'\n\n'}
                <Text style={styles.termsBold}>Finalidad:</Text> Gestionar tu cuenta de usuario, permitir tu
                identificación en la plataforma y facilitarte la conexión con otros usuarios de la aplicación mediante
                tu número de teléfono o correo electrónico.{'\n\n'}
                <Text style={styles.termsBold}>Legitimación:</Text> Consentimiento explícito del usuario al marcar la
                casilla de aceptación.{'\n\n'}
                <Text style={styles.termsBold}>Destinatarios:</Text> Tus datos se almacenarán en servidores de Supabase,
                nuestro proveedor de base de datos, bajo estrictas medidas de seguridad dentro del marco del RGPD. No se
                cederán datos a terceros salvo obligación legal.{'\n\n'}
                <Text style={styles.termsBold}>Derechos:</Text> Tienes derecho a acceder, rectificar, limitar o suprimir
                tus datos en cualquier momento enviando un correo electrónico a{' '}
                <Text style={styles.termsLink} onPress={() => Linking.openURL('mailto:topfcliga@gmail.com')}>
                  topfcliga@gmail.com
                </Text>
                .{'\n\n'}
                <Text style={styles.termsBold}>Información adicional:</Text> Puedes consultar los detalles completos
                sobre cómo tratamos tus datos en nuestra{' '}
                <Text style={styles.termsLink} onPress={() => setShowPrivacyModal(true)}>
                  Política de Privacidad
                </Text>
                .
              </Text>
              <Text style={styles.contentPolicyTitle}>{t('contentPolicyTitle')}</Text>
              <Text style={styles.contentPolicyBody}>{t('contentPolicyBody')}</Text>
            </View>
          )}
        </View>

        <Pressable
          style={[styles.button, (isSaving || !acceptedTerms) && styles.buttonDisabled]}
          disabled={isSaving || !acceptedTerms}
          onPress={saveProfile}>
          <Text style={styles.buttonText}>{isSaving ? t('saving') : t('saveAndContinue')}</Text>
        </Pressable>

        <Pressable
          style={styles.secondary}
          onPress={() => supabase.auth.signOut().then(() => router.replace('/'))}>
          <Text style={styles.secondaryText}>{t('signOut')}</Text>
        </Pressable>

        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      </View>
    </ScrollView>

    <Modal visible={showPrivacyModal} transparent animationType="slide" onRequestClose={() => setShowPrivacyModal(false)}>
      <View style={styles.privacyModalOverlay}>
        <View style={styles.privacyModalContent}>
          <View style={styles.privacyModalHeader}>
            <Text style={styles.privacyModalTitle}>{t('privacyPolicy')}</Text>
            <Pressable onPress={() => setShowPrivacyModal(false)}>
              <Text style={styles.privacyModalClose}>{t('close')}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.privacyModalScroll}>
            <Text style={styles.privacyModalSubText}>Última actualización: 28 de mayo de 2026</Text>
            <Text style={styles.privacyModalBody}>
              {'\n'}La presente Política de Privacidad establece los términos en que se tratan y protegen los datos de
              carácter personal de los usuarios en esta aplicación móvil. Al registrarse y utilizar la aplicación,
              usted acepta las prácticas descritas en este documento.
              {'\n\n'}
              <Text style={styles.privacyModalBold}>1. RESPONSABLE DEL TRATAMIENTO</Text>
              {'\n'}
              Identidad del Responsable: Julián Hortolano Villarejo{'\n'}
              Nombre del proyecto: Voto Secreto{'\n'}
              Domicilio: Madrid, España{'\n'}
              Correo electrónico de contacto:{' '}
              <Text style={styles.privacyLink} onPress={() => Linking.openURL('mailto:topfcliga@gmail.com')}>
                topfcliga@gmail.com
              </Text>
              {'\n\n'}
              <Text style={styles.privacyModalBold}>2. DATOS PERSONALES QUE RECOPILAMOS</Text>
              {'\n'}
              Para el correcto funcionamiento de la aplicación, el registro y la interacción entre usuarios,
              recopilamos y almacenamos los siguientes datos:{'\n\n'}
              Datos de identificación de la cuenta: topfcliga@gmail.com{'\n\n'}
              Datos de uso del dispositivo: Información técnica básica necesaria para la estabilidad de la aplicación
              facilitada por el entorno de ejecución (iOS / Android).
              {'\n\n'}
              <Text style={styles.privacyModalBold}>3. FINALIDAD DEL TRATAMIENTO DE LOS DATOS</Text>
              {'\n'}
              Los datos personales facilitados serán tratados exclusivamente para las siguientes finalidades:{'\n\n'}
              Gestión de la cuenta: Creación, autenticación y mantenimiento de su perfil de usuario en la plataforma.
              {'\n\n'}
              Conectividad e identificación: Permitir que otros usuarios de la aplicación puedan identificarle y
              conectar con usted dentro de la plataforma utilizando su número de teléfono o correo electrónico como
              identificador único.{'\n\n'}
              Soporte técnico: Atender sus consultas, incidencias o solicitudes de asistencia técnica.
              {'\n\n'}
              <Text style={styles.privacyModalBold}>4. LEGITIMACIÓN PARA EL TRATAMIENTO</Text>
              {'\n'}
              La base legal para el tratamiento de sus datos es el consentimiento explícito que usted otorga al marcar
              la casilla de aceptación de esta Política de Privacidad en el formulario de registro, de conformidad con
              el artículo 6.1.a del RGPD. Usted tiene derecho a retirar este consentimiento en cualquier momento, sin
              que ello afecte a la licitud del tratamiento basado en el consentimiento previo a su retirada.
              {'\n\n'}
              <Text style={styles.privacyModalBold}>5. DESTINATARIOS DE LOS DATOS (PROVEEDORES DE SERVICIOS)</Text>
              {'\n'}
              No vendemos, alquilamos ni cedemos sus datos personales a terceros bajo ningún concepto, salvo
              obligación legal. Sin embargo, para la prestación del servicio utilizamos proveedores tecnológicos que
              actúan como encargados del tratamiento bajo estrictas medidas de seguridad:{'\n\n'}
              Base de datos: Los datos se almacenan de forma segura en los servidores de Supabase, nuestro proveedor de
              infraestructura de bases de datos, cuyos centros de datos cumplen con los estándares del RGPD y la
              normativa de la Unión Europea.
              {'\n\n'}
              <Text style={styles.privacyModalBold}>6. PLAZO DE CONSERVACIÓN DE LOS DATOS</Text>
              {'\n'}
              Sus datos personales se conservarán mientras se mantenga su cuenta de usuario activa en la aplicación.
              Si decide dar de baja su cuenta o solicitar la supresión de sus datos, estos serán eliminados de forma
              definitiva de nuestras bases de datos activas, permaneciendo únicamente bloqueados en caso de que fuesen
              necesarios para cumplir con obligaciones legales vigentes.
              {'\n\n'}
              <Text style={styles.privacyModalBold}>7. DERECHOS DEL USUARIO (ARCO+)</Text>
              {'\n'}
              Como interesado y de acuerdo con el RGPD, usted dispone de los siguientes derechos sobre sus datos
              personales:{'\n\n'}
              Derecho de Acceso: Saber si estamos tratando sus datos y qué información exacta tenemos.{'\n'}
              Derecho de Rectificación: Solicitar la corrección de cualquier dato inexacto o incompleto.{'\n'}
              Derecho de Supresión ("Derecho al Olvido"): Solicitar la eliminación total de sus datos de nuestros
              sistemas.{'\n'}
              Derecho de Limitación y Oposición: Oponerse al tratamiento de sus datos o solicitar que se limite el
              alcance del tratamiento.{'\n'}
              Derecho a la Portabilidad: Solicitar recibir sus datos en un formato estructurado y transmitirlo a otro
              responsable.{'\n\n'}
              Para ejercer cualquiera de estos derechos, basta con enviar una solicitud por correo electrónico a{' '}
              <Text style={styles.privacyLink} onPress={() => Linking.openURL('mailto:topfcliga@gmail.com')}>
                topfcliga@gmail.com
              </Text>
              , indicando en el asunto "Protección de Datos" junto con su nombre de usuario (email o teléfono
              registrado).{'\n\n'}
              Asimismo, si considera que sus datos no han sido tratados correctamente, tiene derecho a presentar una
              reclamación ante la autoridad de control competente, en este caso, la Agencia Española de Protección de
              Datos (AEPD) en{' '}
              <Text style={styles.privacyLink} onPress={() => Linking.openURL('https://www.aepd.es')}>
                www.aepd.es
              </Text>
              .
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  scrollContent: { flexGrow: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  helper: {
    marginTop: 12,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSection,
    marginBottom: 20,
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: colors.profileLabel,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.profileInputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
    color: colors.profileInputText,
    backgroundColor: colors.profileInputBg,
  },
  inputDisabled: {
    backgroundColor: colors.disabledBg,
    color: colors.textSecondary,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.profileInputBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  countryFlag: {
    fontSize: 24,
  },
  countryDial: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  countryArrow: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.profileInputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.profileInputText,
    backgroundColor: colors.profileInputBg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalClose: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.profileInputBorder,
    borderRadius: 10,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.profileInputText,
    backgroundColor: colors.profileInputBg,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  countryItemActive: {
    backgroundColor: colors.primaryLight,
  },
  countryItemFlag: {
    fontSize: 26,
  },
  countryItemName: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  countryItemDial: {
    fontSize: 16,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  pickButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  pickButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 16,
  },
  previewWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  previewImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.barBg,
  },
  consentSection: {
    marginVertical: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  checkboxLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  termsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    marginTop: 4,
  },
  termsToggleText: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  termsToggleArrow: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  termsInfo: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    backgroundColor: colors.cardBg,
    marginTop: 8,
  },
  termsBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  termsBold: {
    fontWeight: '700',
    color: colors.text,
  },
  termsLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  contentPolicyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    lineHeight: 20,
  },
  contentPolicyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 8,
  },
  privacyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  privacyModalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 40,
  },
  privacyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  privacyModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  privacyModalClose: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  privacyModalScroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  privacyModalSubText: {
    fontSize: 13,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  privacyModalBody: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  privacyModalBold: {
    fontWeight: '700',
    color: colors.text,
  },
  privacyLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  button: {
    backgroundColor: colors.profileBtn,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.profileBtnText,
    fontSize: 16,
    fontWeight: '600',
  },
  secondary: {
    marginTop: 16,
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.primary,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 14,
    color: colors.errorText,
    textAlign: 'center',
  },
  });
}
