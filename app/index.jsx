import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,              //diàlegs natius del sistema operatiu
  ActivityIndicator,  //roda de càrrega
  TextInput,
} from 'react-native';
import * as Location from 'expo-location'; //accés al GPS
import * as ImagePicker from 'expo-image-picker'; //Accés càmera i galeria i poder demanar permisos
import * as FileSystem from 'expo-file-system/legacy'; //per llegir la foto que s'ha seleccionat i poder-la pujar al SupaBase
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
    // requestForegroundPermissionsAsync: mostra el diàleg natiu del sistema
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      // Si l'usuari prem "Denegar", sortim de la funció amb un missatge informatiu.
      Alert.alert(
        'Permís denegat',
        'Has denegat l\'accés a la localització. Pots canviar-ho des de la configuració del dispositiu.',
      );
      setLoadingGPS(false);
      return;
    }

    // 2. Obtenir coordenades
    // getCurrentPositionAsync: llegeix el GPS una sola vegada (no contínuament).
    // accuracy: Balanced és un bon equilibri entre precisió i velocitat/bateria.
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = location.coords;
    setCoords({ latitude, longitude });

    // 3. Geocodificació inversa
    // reverseGeocodeAsync: converteix coordenades en adreça física.
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length > 0) {
      const r = results[0];
      const parts = [r.street, r.streetNumber, r.city, r.region].filter(Boolean);
      setAddress(parts.join(', '));
    } else {
      // Si no hi ha resultats, mostrem les coordenades en decimal.
      // toFixed(5) arrodoneix a 5 decimals (precisió de ~1 metre).
      setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }

    setLoadingGPS(false); //desactiva roda de càrrega
  };

  // ─── Càmera / Galeria ────────────────────────────────────────────────────────
  const pickImage = async (useCamera) => {
    // useCamera: boolean. true = obrir càmera, false = obrir galeria.
    // Demanem el permís corresponent segons d'on volem agafar la foto.
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
      ? ImagePicker.launchCameraAsync //obre la cam del dispositiu
      : ImagePicker.launchImageLibraryAsync; //obre el selector de fotos del dispositiu

    const result = await fn({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, //només imgs (no videos)
      allowsEditing: true, // Mostra l'editor de retall abans de confirma
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
    // Alert.alert amb array de botons mostra un diàleg d'acció natiu.
    // En Android apareix com un diàleg; en iOS com un Action Sheet.
    Alert.alert('Foto de perfil', 'Escull una opció:', [
      { text: 'Càmera',  onPress: () => pickImage(true)  },
      { text: 'Galeria', onPress: () => pickImage(false) },
      { text: 'Cancel·lar', style: 'cancel' },
    ]);
  };

  // ─── Pujar foto a Supabase Storage ──────────────────────────────────────────
  const uploadAvatar = async () => {
    if (!avatarUri) return null; // Guardià: si no hi ha foto, no fem res

    setLoadingPhoto(true);

    try {
      // Extraiem l'extensió de la URI (ex: "jpg" o "png").
      // .split('?')[0] elimina paràmetres GET que de vegades porten les URIs d'Expo
    const ext      = avatarUri.split('.').pop()?.split('?')[0] || 'jpg';
    const fileName = `avatar_${Date.now()}.${ext}`; // Date.now() retorna el timestamp actual en mil·lisegons 
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    // CONVERSIÓ DE LA FOTO A BYTES
    // Supabase Storage espera dades binàries, però tenim una URI local.
    // Llegir com a base64 i convertir a ArrayBuffer
    const base64 = await FileSystem.readAsStringAsync(avatarUri, {
      encoding: 'base64',
    });

    //Decodificar de base64 a string binari
      // atob() (ASCII To Binary) és una funció global del navegador/JS que converteix un string base64 en un string de caràcters binaris.
    const binary = atob(base64);
    // Convertir el string binari a un array de bytes (Uint8Array)
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    // charCodeAt(i) retorna el valor numèric del caràcter a la posició i.

    // PUJADA A SUPABASE STORAGE
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, bytes.buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) throw new Error(error.message);
    // throw atura l'execució i salta al bloc catch de sota

    // OBTENIR LA URL PÚBLICA
      // Supabase genera una URL permanent i accessible públicament per al fitxer
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    setLoadingPhoto(false);
    return urlData.publicUrl;

  } catch (err) {
    Alert.alert('Error pujant la foto', err.message);
    setLoadingPhoto(false);
    return null; // Retornem null per indicar que la pujada ha fallat
  }
};

  // ─── Guardar perfil a Supabase DB ────────────────────────────────────────────
  const handleSave = async () => {
    // Validació: el nom és obligatori
    if (!name.trim()) {
      // .trim() elimina espais en blanc dels extrems. Evita que " " sigui vàlid.
      Alert.alert('Falta el nom', 'Escriu el teu nom abans de guardar.');
      return;
    }

    setLoadingSave(true);

    // Pujada de foto: només la pugem si:
    // 1. Hi ha una foto seleccionada (avatarUri no és null)
    // 2. Encara no s'ha pujat en aquesta sessió (avatarUrl és null)
    // Això evita tornar a pujar la mateixa foto si l'usuari prem "Guardar" dues vegades.
    let finalAvatarUrl = avatarUrl;
    if (avatarUri && !avatarUrl) {
      finalAvatarUrl = await uploadAvatar();
      if (!finalAvatarUrl) {
        // Si la pujada ha fallat, uploadAvatar ja ha mostrat l'error.
        // Aturem el procés de guardar sense continuar.
        setLoadingSave(false);
        return;
      }
      setAvatarUrl(finalAvatarUrl);
    }

    // Guardar a la taula 'profiles'
    // .upsert(): INSERT si no existeix, UPDATE si ja existeix
    const { error } = await supabase.from(TABLE_NAME).upsert({
      username:   name.trim(),
      avatar_url: finalAvatarUrl,
      address:    address,
      latitude:   coords?.latitude  ?? null,
      longitude:  coords?.longitude ?? null,
      // coords?.latitude: optional chaining (?.) — si coords és null, no llança error,
      // simplement retorna undefined. El ?? null converteix undefined en null.
      updated_at: new Date().toISOString(),
    });

    setLoadingSave(false);

    if (error) {
      Alert.alert('Error guardant el perfil', error.message);
    } else {
      setSaved(true); // Canvia el botó a "Guardat!" i el posa verd
      Alert.alert('✅ Perfil guardat', 'Les teves dades s\'han guardat correctament a Supabase.');
    }
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Avatar */}
      <TouchableOpacity style={styles.avatarWrapper} onPress={showImageOptions}>
        {avatarUri ? (
          //si hi ha URI, mostra la foto; si no, el placeholder
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>+{'\n'}Foto</Text>
          </View>
        )}
        {/* Badge "✎" a la cantonada inferior dreta de l'avatar */}
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarBadgeText}>✎</Text>
        </View>
      </TouchableOpacity>

      {/* Indicador de càrrega de la foto — només visible mentre es puja */}
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
        onChangeText={(t) => { // Es crida a cada tecla premuda
          setName(t);                        // Actualitza el state amb el nou text
          setSaved(false);                   // Reset: si l'usuari edita, cal tornar a guardar
       }}
      />

      {/* Localització */}
      <Text style={styles.label}>Localització</Text>

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={handleGetLocation}
        disabled={loadingGPS} // Quan és true, el botó no respon als tocs
      >
        {loadingGPS ? (
          <ActivityIndicator color="#F0E6D3" />
        ) : (
          <Text style={styles.buttonTextLight}>📍 Obtenir localització actual</Text>
        )}
      </TouchableOpacity>

      {/* Targeta d'adreça — només visible quan address té un valor */}
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
            {/* si saved → "Guardat!", si no → "Guardar perfil" */}
          </Text>
        )}
      </TouchableOpacity>

      {/* URL pública — només visible un cop la foto s'ha pujat correctament */}
      {avatarUrl && (
        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>URL pública de l'avatar:</Text>
          <Text style={styles.urlText} numberOfLines={3}>{avatarUrl}</Text>
          {/* numberOfLines={3}: trunca el text a 3 línies màxim (afegeix "...") */}
        </View>
      )}

    </ScrollView>
  );
}



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
    borderRadius: 60,  // 60 = la meitat de 120 → fa el quadrat rodó (cercle perfecte)
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
    borderStyle: 'dashed',  // Vora puntejada per indicar que es pot tocar
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
    flexDirection: 'row',  // Posa els fills en horitzontal (per defecte és vertical)
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,   // Espai entre els fills (spinner i text)
  },
  uploadingText: {
    color: '#C4A882',
    fontSize: 14,
  },

  // Form
  label: {
    alignSelf: 'flex-start',  // El label s'alinea a l'esquerra (ignora el alignItems: center del pare)
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
    // Modificador aplicat quan saved=true (sobreescriu buttonPrimary)
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