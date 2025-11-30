var isaac = (function(){
  var m = Array(256), r = Array(256), acc = 0, brs = 0, cnt = 0, rsl = Array(256), gnt = 0;

  function seed(s) {
    var a, b, c, d, e, f, g, h, i;
    a = b = c = d = e = f = g = h = 0x9e3779b9;
    if (s && typeof(s) === 'string') s = s.split('').map(function(x){return x.charCodeAt(0)});
    if (s && s.length > 0) {
      s = s.slice(0, 256);
      for (i = 0; i < s.length; i++) rsl[i] = s[i];
    }
    
    function mix() {
      a^=b<<11; d+=a; b+=c;
      b^=c>>>2; e+=b; c+=d;
      c^=d<<8;  f+=c; d+=e;
      d^=e>>>16; g+=d; e+=f;
      e^=f<<10; h+=e; f+=g;
      f^=g>>>4; a+=f; g+=h;
      g^=h<<8;  b+=g; h+=a;
      h^=a>>>9; c+=h; a+=b;
    }

    for (i = 0; i < 4; i++) mix();

    for (i = 0; i < 256; i += 8) {
      if (s && i < s.length) {
        a+=rsl[i]; b+=rsl[i+1]; c+=rsl[i+2]; d+=rsl[i+3];
        e+=rsl[i+4]; f+=rsl[i+5]; g+=rsl[i+6]; h+=rsl[i+7];
      }
      mix();
      m[i] = a; m[i+1] = b; m[i+2] = c; m[i+3] = d;
      m[i+4] = e; m[i+5] = f; m[i+6] = g; m[i+7] = h;
    }

    if (s) {
      for (i = 0; i < 256; i += 8) {
        a+=m[i]; b+=m[i+1]; c+=m[i+2]; d+=m[i+3];
        e+=m[i+4]; f+=m[i+5]; g+=m[i+6]; h+=m[i+7];
        mix();
        m[i] = a; m[i+1] = b; m[i+2] = c; m[i+3] = d;
        m[i+4] = e; m[i+5] = f; m[i+6] = g; m[i+7] = h;
      }
    }

    isaac();
    cnt = 256;
  }

  function isaac() {
    var x, y, i;
    gnt = 0;
    c = ++brs; // brs is global? No, defined in closure.
    // Wait, original C code uses static variables.
    // Let's check the variable definitions at top.
    // var m = Array(256), r = Array(256), acc = 0, brs = 0, cnt = 0, rsl = Array(256), gnt = 0;
    // c is not defined in closure scope, it's defined in seed() but not isaac().
    // Actually, 'brs' corresponds to 'bb' in reference implementation?
    // Let's use a cleaner implementation to be safe.
    
    // Re-implementing based on standard reference to avoid bugs.
    // Using the implementation commonly found in cstimer/scramble generators.
  }
  
  // Redoing the closure with standard variables
  return (function(){
    var m = Array(256), r = Array(256), acc = 0, brs = 0, cnt = 0, rsl = Array(256), gnt = 0;

    function reset() {
      acc = brs = cnt = 0;
      for(var i=0; i<256; ++i) m[i] = rsl[i] = 0;
      gnt = 0;
    }

    function seed(s) {
      var a, b, c, d, e, f, g, h;
      a = b = c = d = e = f = g = h = 0x9e3779b9;
      if (s && typeof(s) === 'string') s = s.split('').map(function(x){return x.charCodeAt(0)});
      if (s && s.length > 0) {
        s = s.slice(0, 256);
        for (var i = 0; i < s.length; i++) rsl[i] = s[i];
      }
      
      function mix() {
        a^=b<<11; d+=a; b+=c;
        b^=c>>>2; e+=b; c+=d;
        c^=d<<8;  f+=c; d+=e;
        d^=e>>>16; g+=d; e+=f;
        e^=f<<10; h+=e; f+=g;
        f^=g>>>4; a+=f; g+=h;
        g^=h<<8;  b+=g; h+=a;
        h^=a>>>9; c+=h; a+=b;
      }

      for (var i = 0; i < 4; i++) mix();

      for (var i = 0; i < 256; i += 8) {
        if (s && i < s.length) {
          a+=rsl[i]; b+=rsl[i+1]; c+=rsl[i+2]; d+=rsl[i+3];
          e+=rsl[i+4]; f+=rsl[i+5]; g+=rsl[i+6]; h+=rsl[i+7];
        }
        mix();
        m[i] = a; m[i+1] = b; m[i+2] = c; m[i+3] = d;
        m[i+4] = e; m[i+5] = f; m[i+6] = g; m[i+7] = h;
      }

      if (s) {
        for (var i = 0; i < 256; i += 8) {
          a+=m[i]; b+=m[i+1]; c+=m[i+2]; d+=m[i+3];
          e+=m[i+4]; f+=m[i+5]; g+=m[i+6]; h+=m[i+7];
          mix();
          m[i] = a; m[i+1] = b; m[i+2] = c; m[i+3] = d;
          m[i+4] = e; m[i+5] = f; m[i+6] = g; m[i+7] = h;
        }
      }

      prng();
      gnt = 256;
    }

    function prng() {
      var x, y;
      brs = (brs + 1) >>> 0;
      acc = (acc + brs) >>> 0; // Using unsigned shift to force 32-bit unsigned
      for (var i = 0; i < 256; i++) {
        x = m[i];
        switch (i & 3) {
          case 0: acc ^= acc << 13; break;
          case 1: acc ^= acc >>> 6; break;
          case 2: acc ^= acc << 2; break;
          case 3: acc ^= acc >>> 16; break;
        }
        acc = (m[(i + 128) & 0xff] + acc) >>> 0;
        y = (m[(x >>> 2) & 0xff] + acc + brs) >>> 0;
        m[i] = y;
        brs = (m[(y >>> 10) & 0xff] + x) >>> 0;
        rsl[i] = brs;
      }
    }

    function rand() {
      if (!gnt--) {
        prng();
        gnt = 255;
      }
      return rsl[gnt];
    }

    function random() {
      return (rand() >>> 0) / 4294967296; // 2^32
    }

    return {
      reset: reset,
      seed: seed,
      prng: prng,
      rand: rand,
      random: random
    };
  })();
})();

export default isaac;
