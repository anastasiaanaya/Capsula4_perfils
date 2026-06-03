import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────
const BUCKET_NAME = 'avatars';
const TABLE_NAME  = 'profiles';

export default function ProfileScreen() {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [name, setName]           = useState('');
  const [avatarUri, setAvatarUri] = useState(null);   // URI local (preview)
  const [avatarUrl, setAvatarUrl] = useState(null);   // URL pública Supabase
  const [address, setAddress]     = useState(null);
  const [coords, setCoords]       = useState(null);

  const [loadingGPS,    setLoadingGPS]    = useState(false);
  const [loadingPhoto,  setLoadingPhoto]  = useState(false);
  const [loadingSave,   setLoadingSave]   = useState(false);
  const [saved,         setSaved]         = useState(false);

  // ─── GPS: obtenir localització ───────────────────────────────────────────────
  const handleGetLocation = async () => {
    setLoadingGPS(true);
    setAddress(null);
    setCoords(null);

    // 1. Demanar permís
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permís denegat',
        'Has denegat l\'accés a la localització. Pots canviar-ho des de la configuració del dispositiu.',
      );
      setLoadingGPS(false);
      return;
    }

    // 2. Obtenir coordenades
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = location.coords;
    setCoords({ latitude, longitude });

    // 3. Geocodificació inversa
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length > 0) {
      const r = results[0];
      const parts = [r.street, r.streetNumber, r.city, r.region].filter(Boolean);
      setAddress(parts.join(', '));
    } else {
      setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }

    setLoadingGPS(false);
  };

  // ─── Càmera / Galeria ────────────────────────────────────────────────────────
  const pickImage = async (useCamera) => {
    // Demanar permís corresponent
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permís denegat', 'Necessites permís per accedir a la càmera.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permís denegat', 'Necessites permís per accedir a la galeria.');
        return;
      }
    }

    const fn = useCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await fn({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],  // quadrat, ideal per avatar
      quality: 0.7,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
      setAvatarUrl(null); // reset URL pública fins que es pugi
      setSaved(false);
    }
  };

  const showImageOptions = () => {
    Alert.alert('Foto de perfil', 'Escull una opció:', [
      { text: 'Càmera',  onPress: () => pickImage(true)  },
      { text: 'Galeria', onPress: () => pickImage(false) },
      { text: 'Cancel·lar', style: 'cancel' },
    ]);
  };

  // ─── Pujar foto a Supabase Storage ──────────────────────────────────────────
  const uploadAvatar = async () => {
    if (!avatarUri) return null;

    setLoadingPhoto(true);

    // Llegir la imatge com a blob
    const response  = await fetch(avatarUri);
    const blob      = await response.blob();
    const ext       = avatarUri.split('.').pop() || 'jpg';
    const fileName  = `avatar_${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, blob, { contentType: `image/${ext}` });

    if (error) {
      Alert.alert('Error pujant la foto', error.message);
      setLoadingPhoto(false);
      return null;
    }

    // Obtenir URL pública
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    setLoadingPhoto(false);
    return urlData.publicUrl;
  };

  // ─── Guardar perfil a Supabase DB ────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Falta el nom', 'Escriu el teu nom abans de guardar.');
      return;
    }

    setLoadingSave(true);

    // Pujar foto si n'hi ha una de nova (local)
    let finalAvatarUrl = avatarUrl;
    if (avatarUri && !avatarUrl) {
      finalAvatarUrl = await uploadAvatar();
      if (!finalAvatarUrl) {
        setLoadingSave(false);
        return;
      }
      setAvatarUrl(finalAvatarUrl);
    }

    // Guardar a la taula 'profiles'
    const { error } = await supabase.from(TABLE_NAME).upsert({
      username:   name.trim(),
      avatar_url: finalAvatarUrl,
      address:    address,
      latitude:   coords?.latitude  ?? null,
      longitude:  coords?.longitude ?? null,
      updated_at: new Date().toISOString(),
    });

    setLoadingSave(false);

    if (error) {
      Alert.alert('Error guardant el perfil', error.message);
    } else {
      setSaved(true);
      Alert.alert('✅ Perfil guardat', 'Les teves dades s\'han guardat correctament a Supabase.');
    }
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Avatar */}
      <TouchableOpacity style={styles.avatarWrapper} onPress={showImageOptions}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>+{'\n'}Foto</Text>
          </View>
        )}
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarBadgeText}>✎</Text>
        </View>
      </TouchableOpacity>

      {loadingPhoto && (
        <View style={styles.uploadingRow}>
          <ActivityIndicator size="small" color="#6c63ff" />
          <Text style={styles.uploadingText}>Pujant foto…</Text>
        </View>
      )}

      {/* Nom */}
      <Text style={styles.label}>Nom</Text>
      <TextInput
        style={styles.input}
        placeholder="El teu nom o àlies"
        placeholderTextColor="#888"
        value={name}
        onChangeText={(t) => { setName(t); setSaved(false); }}
      />

      {/* Localització */}
      <Text style={styles.label}>Localització</Text>

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={handleGetLocation}
        disabled={loadingGPS}
      >
        {loadingGPS ? (
          <ActivityIndicator color="#F0E6D3" />
        ) : (
          <Text style={styles.buttonTextLight}>📍 Obtenir localització actual</Text>
        )}
      </TouchableOpacity>

      {address && (
        <View style={styles.addressCard}>
          <Text style={styles.addressLabel}>Adreça detectada:</Text>
          <Text style={styles.addressText}>{address}</Text>
          {coords && (
            <Text style={styles.coordsText}>
              {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </Text>
          )}
        </View>
      )}

      {/* Guardar */}
      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, saved && styles.buttonSaved]}
        onPress={handleSave}
        disabled={loadingSave}
      >
        {loadingSave ? (
          <ActivityIndicator color="#2C1F3E" />
        ) : (
          <Text style={styles.buttonText}>
            {saved ? '✅ Guardat!' : '💾 Guardar perfil'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Info URL pública */}
      {avatarUrl && (
        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>URL pública de l'avatar:</Text>
          <Text style={styles.urlText} numberOfLines={3}>{avatarUrl}</Text>
        </View>
      )}

    </ScrollView>
  );
}

// ─── Paleta ───────────────────────────────────────────────────────────────────
// Fons:      #2C1F3E  (lila molt fosc, tapa de llibre)
// Superfície:#3D2B55  (lila fosc, pàgines interiors)
// Card:      #4A3464  (lila mitjà, targetes)
// Accent:    #C4A882  (marró daurat, filigrana)
// Accent2:   #8B6B9E  (lila suau, secundari)
// Text:      #F0E6D3  (crema, text principal)
// TextSub:   #B39DBC  (lila clar, text secundari)

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2C1F3E',
  },
  content: {
    padding: 24,
    alignItems: 'center',
    paddingBottom: 48,
  },

  // Avatar
  avatarWrapper: {
    marginBottom: 28,
    marginTop: 8,
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#C4A882',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#3D2B55',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#C4A882',
    borderStyle: 'dashed',
  },
  avatarPlaceholderText: {
    color: '#C4A882',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#C4A882',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2C1F3E',
  },
  avatarBadgeText: {
    color: '#2C1F3E',
    fontSize: 14,
  },

  // Upload
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  uploadingText: {
    color: '#C4A882',
    fontSize: 14,
  },

  // Form
  label: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    color: '#C4A882',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  input: {
    width: '100%',
    backgroundColor: '#3D2B55',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: '#F0E6D3',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#5A4070',
  },

  // Buttons
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonPrimary: {
    backgroundColor: '#C4A882',
    marginTop: 8,
  },
  buttonSecondary: {
    backgroundColor: '#5A3E7A',
    borderWidth: 1,
    borderColor: '#8B6B9E',
  },
  buttonSaved: {
    backgroundColor: '#6B8E5A',
  },
  buttonText: {
    color: '#2C1F3E',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonTextLight: {
    color: '#F0E6D3',
    fontSize: 15,
    fontWeight: '600',
  },

  // Address card
  addressCard: {
    width: '100%',
    backgroundColor: '#3D2B55',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#C4A882',
  },
  addressLabel: {
    fontSize: 11,
    color: '#B39DBC',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addressText: {
    fontSize: 15,
    color: '#F0E6D3',
    fontWeight: '500',
  },
  coordsText: {
    fontSize: 11,
    color: '#8B6B9E',
    marginTop: 6,
    fontFamily: 'monospace',
  },

  // URL card
  urlCard: {
    width: '100%',
    backgroundColor: '#3D2B55',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#8B6B9E',
  },
  urlLabel: {
    fontSize: 11,
    color: '#B39DBC',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  urlText: {
    fontSize: 11,
    color: '#C4A882',
    fontFamily: 'monospace',
  },
});