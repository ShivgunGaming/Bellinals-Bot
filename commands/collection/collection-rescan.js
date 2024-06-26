const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js')
const { QueryTypes } = require('sequelize')
const errorEmbed = require('../../embed/error-embed')
const { insVerifications } = require('../../utils/verifications')
const UserInscriptions = require('../../db/user-inscriptions')
const sequelize = require('../../db/db-connect')
const { getOwnerAddress } = require('../../utils/verify-ins')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collection-rescan')
    .setDescription('Re-scan all verified inscriptions to check for ownership changes')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    // This is a long query, we need to defer the reply so the user knows we are working on it
    await interaction.deferReply({
      ephemeral: true,
    })

    try {
      const query = `Select
        UserInscriptions.id as id,
        UserAddresses.walletAddress as walletAddress,
        UserAddresses.userId as userId,
        inscriptionInfos.inscriptionRef as inscriptionRef,
        inscriptionInfos.role as role
      From UserInscriptions, UserAddresses, (
        Select
          Collections.name as collectionName,
          Inscriptions.id as inscriptionId,
          Collections.role as role,
          Inscriptions.inscriptionRef as inscriptionRef
        From Collections, Inscriptions
        where Collections.channelId='${interaction.channelId}'
          and Inscriptions.collectionId=Collections.id
        )
        as inscriptionInfos
      where UserInscriptions.inscriptionId=inscriptionInfos.inscriptionId
        and UserAddresses.id=UserInscriptions.userAddressId
        and UserInscriptions.deletedAt is null`

      const [insInfos] = await sequelize.query(query, QueryTypes.SELECT)

      const userRemoves = []
      const userRoles = []

      console.log(`Starting rescan for ${interaction.channelId}`)

      // We want to loop all of the inscriptions, find their current address and if it has moved we can remove the role
      // We then want to bucket all affected users, and re-run their validation for their remaining inscriptions
      for (const insInfo of insInfos) {
        console.log(`Checking inscription ${insInfo.inscriptionRef} for user ${insInfo.userId}`)
        const ownerAddress = await getOwnerAddress(insInfo.inscriptionRef)
        // If the owner address is different to the address we have stored, we need to remove the role
        if (ownerAddress !== insInfo.walletAddress) {
          console.log(`Owner address ${ownerAddress} is different to stored address ${insInfo.walletAddress}`)

          // Remove role
          try {
            // Add the user id to the userRemoves array if it doesn't already exist
            if (!userRemoves.find((userRemove) => userRemove.userId === insInfo.userId)) {
              userRemoves.push({ userId: insInfo.userId })
            }
            console.log(`Removing role ${insInfo.role} from user ${insInfo.userId}`)

            const role = interaction.member.guild.roles.cache.find((roleItem) => roleItem.name === insInfo.role)
            const user = interaction.member.guild.members.cache.find((user) => user.user.id === insInfo.userId)

            // Some users may have left the server
            if (user) {
              await user.roles.remove(role)
            }
          } catch (error) {
            console.log(error)
          }
          // Retire inscription
          await UserInscriptions.destroy({
            where: {
              id: insInfo.id,
            },
          })
        } else {
          console.log(`Owner address ${ownerAddress} is the same as stored address ${insInfo.walletAddress}`)
          // We need to add the role to the userRoles array if it doesn't already exist
          if (!userRoles.find((userRole) => userRole.role === insInfo.role && userRole.userId === insInfo.userId)) {
            userRoles.push({ role: insInfo.role, userId: insInfo.userId })
          }
        }
      }

      // We now need to re-scan the live inscriptions for each affected user to ensure we have the correct roles
      for (const userRole of userRoles) {
        // Add role
        try {
          console.log(`Adding role ${userRole.role} to user ${userRole.userId}`)
          const role = interaction.member.guild.roles.cache.find((roleItem) => roleItem.name === userRole.role)
          const user = interaction.member.guild.members.cache.find((user) => user.user.id === userRole.userId)

          // Some users may have left the server
          if (user) {
            await user.roles.add(role)
          } else {
            console.log(`Looks like user ${userRole.userId} has left the server`)
          }
        } catch (error) {
          console.log(error)
        }
      }

      const embed = await insVerifications(interaction)
      return interaction.editReply({ embeds: [embed] })
    } catch (error) {
      const embed = errorEmbed(error)
      if (interaction.replied) return interaction.editReply({ embeds: [embed], ephemeral: true })
      else return interaction.reply({ embeds: [embed], ephemeral: true })
    }
  },
}
