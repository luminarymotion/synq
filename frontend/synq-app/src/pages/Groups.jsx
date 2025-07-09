import React from 'react';
import { Box, Container, Card, CardContent, Typography, Button, Stack, Avatar, IconButton, Divider } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

// Ghibli-inspired earthy palette
const palette = {
  bg: '#f5f3e7',
  card: '#f9f6ef',
  accent: '#b5c99a',
  accent2: '#a47551',
  accent3: '#e2b07a',
  text: '#4e342e',
  textSoft: '#7c5e48',
  border: '#e0c9b3',
};

function Groups() {
  // TODO: Replace with real data and logic
  const myCommunities = [
    { name: 'University Carpool', members: 18, type: 'school', avatar: '/group2.jpg' },
    { name: 'Weekend Warriors', members: 28, type: 'social', avatar: '/group3.jpg' },
    { name: 'Soccer Parents Network', members: 31, type: 'sports', avatar: '/group1.jpg' },
  ];
  const trendingCommunities = [
    { name: 'Family Adventure Club', members: 12, avatar: '/group1.jpg' },
    { name: 'Green Lake Neighbors', members: 47, avatar: '/group2.jpg' },
    { name: 'Downtown Commuters', members: 24, avatar: '/group3.jpg' },
  ];

  return (
    <Box sx={{ background: palette.bg, minHeight: '100vh', py: { xs: 2, md: 5 } }}>
      <Container maxWidth="xl" sx={{ px: { xs: 1, sm: 3, md: 6 } }}>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          {/* Main Content (2/3) */}
          <Box sx={{ flex: 2, minWidth: 0 }}>
            {/* My Communities */}
            <Card sx={{ borderRadius: 4, mb: 4, background: palette.card, boxShadow: '0 2px 12px 0 #e0c9b3' }}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                  <Typography variant="h5" fontWeight={700} color={palette.text}>
                    My Communities
                  </Typography>
                  <Button variant="contained" startIcon={<AddIcon />} sx={{ background: palette.accent2, color: '#fff', borderRadius: 2, fontWeight: 600 }}>
                    Create Community
                  </Button>
                </Box>
                {/* TODO: Replace with actual communities logic */}
                <Stack spacing={2}>
                  {myCommunities.map((group, idx) => (
                    <Box key={idx} display="flex" alignItems="center">
                      <Avatar src={group.avatar} sx={{ width: 40, height: 40, mr: 2 }} />
                      <Box>
                        <Typography variant="body1" fontWeight={600}>{group.name}</Typography>
                        <Typography variant="caption" color={palette.textSoft}>{group.members} members • {group.type}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            {/* Community Feed/Activity */}
            <Card sx={{ borderRadius: 4, mb: 4, background: palette.card, boxShadow: '0 2px 12px 0 #e0c9b3' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={700} color={palette.textSoft} mb={2}>
                  Community Pulse
                </Typography>
                {/* TODO: Replace with real community feed/activity logic */}
                <Stack spacing={1}>
                  <Typography color={palette.textSoft}>No recent activity yet.</Typography>
                </Stack>
              </CardContent>
            </Card>

            {/* Community Details Placeholder */}
            <Card sx={{ borderRadius: 4, mb: 4, background: palette.card, boxShadow: '0 2px 12px 0 #e0c9b3' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={700} color={palette.textSoft} mb={2}>
                  Community Details
                </Typography>
                {/* TODO: Replace with selected community details logic */}
                <Typography color={palette.textSoft}>Select a community to view details.</Typography>
              </CardContent>
            </Card>

            {/* Members/Participants Placeholder */}
            <Card sx={{ borderRadius: 4, mb: 4, background: palette.card, boxShadow: '0 2px 12px 0 #e0c9b3' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={700} color={palette.textSoft} mb={2}>
                  Members
                </Typography>
                {/* TODO: Replace with members/participants logic */}
                <Typography color={palette.textSoft}>Select a community to view members.</Typography>
              </CardContent>
            </Card>
          </Box>

          {/* Sidebar (1/3) */}
          <Box sx={{ flex: 1, minWidth: 280, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 3, position: 'sticky', top: 32, alignSelf: 'flex-start', background: { md: '#f9f6ef' }, borderRadius: 4, boxShadow: { md: '0 2px 16px 0 #e0c9b3' }, p: { md: 2, xs: 0 } }}>
            {/* Trending Communities */}
            <Card sx={{ borderRadius: 4, boxShadow: 0, mb: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <TrendingUpIcon sx={{ color: palette.accent2, mr: 1 }} />
                  <Typography variant="h6" fontWeight={700} color={palette.textSoft}>
                    Trending Communities
                  </Typography>
                </Box>
                {/* TODO: Replace with trending communities logic */}
                <Stack spacing={2}>
                  {trendingCommunities.map((group, idx) => (
                    <Box key={idx} display="flex" alignItems="center" justifyContent="space-between">
                      <Box display="flex" alignItems="center">
                        <Avatar src={group.avatar} sx={{ width: 32, height: 32, mr: 2 }} />
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{group.name}</Typography>
                          <Typography variant="caption" color={palette.textSoft}>{group.members} members</Typography>
                        </Box>
                      </Box>
                      <Button size="small" variant="outlined" sx={{ color: palette.accent2, borderColor: palette.border, borderRadius: 2, fontWeight: 600 }}>Join</Button>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card sx={{ borderRadius: 4, boxShadow: 0, background: palette.card }}>
              <CardContent>
                <Typography variant="h6" fontWeight={700} color={palette.textSoft} mb={2}>
                  Quick Actions
                </Typography>
                <Stack spacing={2}>
                  <Button variant="contained" startIcon={<AddIcon />} sx={{ background: palette.accent2, color: '#fff', borderRadius: 2, fontWeight: 600 }}>
                    Create Community
                  </Button>
                  <Button variant="outlined" sx={{ color: palette.accent2, borderColor: palette.border, borderRadius: 2, fontWeight: 600 }}>
                    Join Community
                  </Button>
                  <Button variant="outlined" sx={{ color: palette.accent2, borderColor: palette.border, borderRadius: 2, fontWeight: 600 }}>
                    Browse Communities
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

export default Groups; 